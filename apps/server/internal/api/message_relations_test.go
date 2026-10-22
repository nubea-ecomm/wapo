package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func persistRelationMessage(t *testing.T, s *Server, p string, message store.Object) {
	t.Helper()

	ctx := context.Background()

	tx, err := s.Store.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)

	if err = store.SaveMessage(ctx, tx, p, message); err != nil {
		t.Fatal(err)
	}

	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestIncomingReactionChangesRemovalAndQuotedMessageIsolation(t *testing.T) {
	s, h, p, key := fixture(t)
	ctx := context.Background()
	c := metaTestConnection(t, s, p, "relations-"+p, "phone-"+p)
	con := str(c, "id")
	contact := "15550001111"
	chat := store.ConversationID(con, contact)
	message := func(id, direction string) store.Object {
		m := store.Object{"id": id, "connection_id": con, "channel": "whatsapp", "direction": direction, "status": "sent", "timestamp": time.Now().UTC().Format(time.RFC3339Nano), "payload": store.Object{"type": "text", "text": store.Object{"body": id}}}
		if direction == "inbound" {
			m["from"] = contact
		} else {
			m["to"] = contact
		}

		return m
	}
	persistRelationMessage(t, s, p, message("incoming", "inbound"))
	persistRelationMessage(t, s, p, message("outgoing", "outbound"))

	path := "/v1/conversations/" + chat
	status, out := request(t, h.URL, key, "POST", path+"/read", store.Object{"message_id": "incoming"}, "")
	expect(t, status, 200, out)
	window := str(object(out, "data"), "service_window_expires_at")
	timestamp := time.Now().Unix() - 100
	send := func(id, target, emoji string, at int64, remove bool, aliases ...string) {
		t.Helper()

		reaction := store.Object{"message_id": target}
		if !remove {
			reaction["emoji"] = emoji
		}

		from := contact
		if len(aliases) > 0 {
			from = aliases[0]
		}

		payload := store.Object{"entry": []any{store.Object{"id": c["business_account_id"], "changes": []any{store.Object{"field": "messages", "value": store.Object{"metadata": store.Object{"phone_number_id": c["external_id"]}, "messages": []any{store.Object{"id": id, "from": from, "timestamp": strconv.FormatInt(at, 10), "type": "reaction", "reaction": reaction}}}}}}}}
		code, raw := postMetaWebhook(t, h.URL, "/hooks/meta", payload, s.Config.MetaAppSecret)

		if code != 200 {
			t.Fatalf("reaction ingress failed: %d %s", code, raw)
		}
	}
	find := func(id string) store.Object {
		t.Helper()
		code, body := request(t, h.URL, key, "GET", path+"/messages", nil, "")
		expect(t, code, 200, body)

		for _, value := range body["data"].([]any) {
			m := value.(map[string]any)
			if str(m, "id") == id {
				return m
			}
		}

		t.Fatalf("message %s missing", id)

		return nil
	}

	send("reaction-one", "outgoing", "👍", timestamp, false)

	if reactions := find("outgoing")["reactions"].([]any); len(reactions) != 1 || str(reactions[0].(map[string]any), "emoji") != "👍" {
		t.Fatal(reactions)
	}

	// Meta may reuse a reaction message ID for a change/removal.
	send("reaction-one", "outgoing", "❤️", timestamp+1, false)

	if reactions := find("outgoing")["reactions"].([]any); len(reactions) != 1 || str(reactions[0].(map[string]any), "emoji") != "❤️" {
		t.Fatal(reactions)
	}

	send("reaction-one", "outgoing", "", timestamp+2, true)
	send("late-reaction", "outgoing", "👍", timestamp, false)
	send("reaction-one", "outgoing", "❤️", timestamp+1, false)

	if reactions := find("outgoing")["reactions"].([]any); len(reactions) != 0 {
		t.Fatal("late/repeated webhook resurrected removed reaction", reactions)
	}

	status, out = request(t, h.URL, key, "GET", path, nil, "")
	expect(t, status, 200, out)

	if object(out, "data")["has_unread"] != false || str(object(out, "data"), "service_window_expires_at") != window || str(object(object(out, "data"), "last_message"), "id") != "outgoing" {
		t.Fatal("reaction changed unread/window/preview", out)
	}

	status, out = request(t, h.URL, key, "GET", path+"/messages", nil, "")
	expect(t, status, 200, out)

	if len(out["data"].([]any)) != 2 {
		t.Fatal("reaction appeared as standalone message", out)
	}

	send("orphan-reaction", "arrives-later", "🎉", timestamp+3, false)
	persistRelationMessage(t, s, p, message("arrives-later", "outbound"))

	if len(find("arrives-later")["reactions"].([]any)) != 1 {
		t.Fatal("reaction arriving before target was lost")
	}

	quote := message("quoted-reply", "inbound")
	quote["payload"] = store.Object{"type": "text", "text": store.Object{"body": "reply"}, "context": store.Object{"id": "outgoing"}}
	persistRelationMessage(t, s, p, quote)

	if reference := object(find("quoted-reply"), "reply_to"); reference["unavailable"] != false || str(reference, "message_id") != "outgoing" {
		t.Fatal(reference)
	}

	foreign := message("foreign-message", "outbound")
	foreign["to"] = "15550009999"
	persistRelationMessage(t, s, p, foreign)

	quote["id"] = "foreign-quote"
	quote["payload"] = store.Object{"type": "text", "text": store.Object{"body": "reply"}, "context": store.Object{"id": "foreign-message"}}
	persistRelationMessage(t, s, p, quote)

	if reference := object(find("foreign-quote"), "reply_to"); reference["unavailable"] != true || reference["payload"] != nil {
		t.Fatal("quote leaked another conversation", reference)
	}

	if _, err := s.Store.Get(ctx, p, "messages", "reaction-one"); err != nil {
		t.Fatal("raw reaction journal missing", err)
	}

	send("alias-reaction", "outgoing", "👏", timestamp+5, false, "15559999999")

	status, out = request(t, h.URL, key, "DELETE", "/v1/contacts/"+chat, nil, "")
	expect(t, status, 204, out)

	if _, err := s.Store.Get(ctx, p, "messages", "alias-reaction"); err == nil {
		t.Fatal("contact erasure retained a target-scoped reaction")
	}

	var events int

	if err := s.Store.Pool.QueryRow(ctx, `SELECT count(*) FROM events WHERE project_id=$1 AND payload#>>'{data,message_id}'='alias-reaction'`, p).Scan(&events); err != nil || events != 0 {
		t.Fatal("reaction event retained after erasure", events, err)
	}

	if _, err := s.Store.Get(ctx, p, "messages", "foreign-message"); err != nil {
		t.Fatal("erasure affected another conversation", err)
	}
}

func TestSendRepliesAndReactionsAreScopedIdempotentAndHandleFailure(t *testing.T) {
	s, h, p, key := fixture(t)
	ctx := context.Background()
	c := metaTestConnection(t, s, p, "send-relations-"+p, "send-phone-"+p)
	con := str(c, "id")
	contact := "15550002222"
	chat := store.ConversationID(con, contact)
	c["access_token"] = s.Store.Seal("fake-token", p)

	if err := s.Store.Put(ctx, p, "connections", con, c, false); err != nil {
		t.Fatal(err)
	}

	persistRelationMessage(t, s, p, store.Object{"id": "original", "connection_id": con, "channel": "whatsapp", "direction": "inbound", "from": contact, "status": "received", "timestamp": time.Now().UTC().Format(time.RFC3339Nano), "payload": store.Object{"type": "text", "text": store.Object{"body": "Original"}}})

	calls := 0
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++

		var body store.Object

		json.NewDecoder(r.Body).Decode(&body)

		if str(body, "to") != contact {
			t.Error("wrong recipient")
		}

		write(w, 200, store.Object{"messages": []any{store.Object{"id": "sent-" + strconv.Itoa(calls)}}})
	}))

	defer meta.Close()

	s.Meta.BaseURL = meta.URL
	path := "/v1/conversations/" + chat + "/messages"
	react := func(emoji, idem string) (int, store.Object) {
		return request(t, h.URL, key, "POST", path, store.Object{"payload": store.Object{"type": "reaction", "reaction": store.Object{"message_id": "original", "emoji": emoji}}}, idem)
	}
	status, out := react("👍", "reaction-key")
	expect(t, status, 201, out)
	status, out = react("👍", "reaction-key")
	expect(t, status, 201, out)

	if calls != 1 {
		t.Fatal("reaction replay sent twice")
	}

	status, out = react("❤️", "reaction-second")
	expect(t, status, 201, out)
	failed := str(object(out, "data"), "id")
	if _, err := s.Store.Patch(ctx, p, "messages", failed, store.Object{"status": "failed"}); err != nil {
		t.Fatal(err)
	}

	status, out = request(t, h.URL, key, "GET", path, nil, "")
	expect(t, status, 200, out)
	reactions := out["data"].([]any)[0].(map[string]any)["reactions"].([]any)
	if len(reactions) != 1 || str(reactions[0].(map[string]any), "emoji") != "👍" {
		t.Fatal("failed reaction replaced confirmed reaction", reactions)
	}

	status, out = react("", "reaction-remove")
	expect(t, status, 201, out)
	status, out = request(t, h.URL, key, "GET", path, nil, "")
	expect(t, status, 200, out)

	if len(out["data"].([]any)[0].(map[string]any)["reactions"].([]any)) != 0 {
		t.Fatal("own reaction not removed")
	}

	input := store.Object{"payload": store.Object{"type": "text", "text": store.Object{"body": "Quoted reply"}, "context": store.Object{"message_id": "original"}}}
	status, out = request(t, h.URL, key, "POST", path, input, "quoted-key")
	expect(t, status, 201, out)

	if str(object(object(object(out, "data"), "payload"), "context"), "message_id") != "original" {
		t.Fatal("reply context lost")
	}

	before := calls
	object(object(input, "payload"), "context")["message_id"] = "not-in-this-conversation"
	status, out = request(t, h.URL, key, "POST", path, input, "bad-quote")
	expect(t, status, 422, out)

	if calls != before {
		t.Fatal("invalid reference reached provider")
	}
}

package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func TestWhatsAppConfirmedRecipientRouting(t *testing.T) {
	s, h, project, key := fixture(t)
	ctx := context.Background()
	connection := store.ID("con")
	input, identity := "541132647689", "5491132647689"

	if err := s.Store.Put(ctx, project, "connections", connection, store.Object{"id": connection, "channel": "whatsapp", "external_id": "772001", "business_account_id": "772000", "access_token": s.Store.Seal("fake-token", project), "status": "connected"}, true); err != nil {
		t.Fatal(err)
	}

	response := store.Object{"contacts": []any{store.Object{"input": input, "wa_id": identity}}}
	// A historical accepted send from the old implementation already supplies
	// the evidence; upgrading must not require a real exploratory send.
	oldConversationID := store.ConversationID(connection, input)
	if err := s.Store.Put(ctx, project, "messages", "historical", store.Object{"id": "historical", "channel": "whatsapp", "connection_id": connection, "conversation_id": oldConversationID, "direction": "outbound", "status": "delivered", "to": input, "payload": store.Object{"to": input}, "provider_response": response}, true); err != nil {
		t.Fatal(err)
	}

	if err := s.Store.Put(ctx, project, "conversations", oldConversationID, store.Object{"id": oldConversationID, "channel": "whatsapp", "connection_id": connection, "contact": input}, true); err != nil {
		t.Fatal(err)
	}

	conversationID := store.ConversationID(connection, identity)
	if err := s.Store.Put(ctx, project, "conversations", conversationID, store.Object{"id": conversationID, "channel": "whatsapp", "connection_id": connection, "contact": identity, "service_window_expires_at": time.Now().Add(time.Hour).UTC().Format(time.RFC3339Nano)}, true); err != nil {
		t.Fatal(err)
	}

	calls := 0
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++

		var payload store.Object

		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}

		if str(payload, "to") != input {
			t.Errorf("sent to %q instead of confirmed input", str(payload, "to"))
			write(w, 400, store.Object{"error": store.Object{"code": 131030}})

			return
		}

		write(w, 200, store.Object{"contacts": response["contacts"], "messages": []any{store.Object{"id": "mapped-message"}}})
	}))

	defer meta.Close()

	s.Meta.BaseURL = meta.URL
	path := "/v1/conversations/" + oldConversationID + "/messages"
	body := store.Object{"text": "Reply using confirmed recipient"}
	status, out := request(t, h.URL, key, "POST", path, body, "mapped-reply")
	expect(t, status, 201, out)
	msg := object(out, "data")
	if str(msg, "to") != identity || str(msg, "conversation_id") != conversationID || str(object(msg, "payload"), "to") != input {
		t.Fatalf("identity and transport recipient were conflated: %#v", msg)
	}

	status, out = request(t, h.URL, key, "POST", path, body, "mapped-reply")
	expect(t, status, 201, out)

	if calls != 1 {
		t.Fatalf("idempotent replay sent %d messages", calls)
	}

	status, out = request(t, h.URL, key, "GET", path, nil, "")
	expect(t, status, 200, out)

	if len(out["data"].([]any)) != 2 {
		t.Fatalf("historical messages were not reconciled: %#v", out)
	}

	if _, err := s.Store.Get(ctx, project, "conversations", oldConversationID); err == nil {
		t.Fatal("duplicate legacy inbox conversation remains")
	}

	status, out = request(t, h.URL, key, "GET", "/v1/conversations/"+oldConversationID+"/messages", nil, "")
	expect(t, status, 200, out)

	if len(out["data"].([]any)) != 2 {
		t.Fatalf("legacy conversation URL lost its history: %#v", out)
	}

	for _, scope := range [][2]string{{project, "different-connection"}, {"different-project", connection}} {
		gotInput, gotIdentity, err := s.Store.WhatsAppRecipient(ctx, scope[0], scope[1], identity)
		if err != nil || gotInput != identity || gotIdentity != identity {
			t.Fatalf("mapping escaped scope: %q %q %v", gotInput, gotIdentity, err)
		}
	}

	// Numeric resemblance alone must never authorize rerouting.
	gotInput, _, err := s.Store.WhatsAppRecipient(ctx, project, connection, "5491132647688")
	if err != nil || gotInput != "5491132647688" {
		t.Fatalf("unconfirmed recipient was rewritten: %q %v", gotInput, err)
	}

	_, canonical, err := s.Store.WhatsAppRecipient(ctx, project, connection, input)
	if err != nil || canonical != identity {
		t.Fatalf("accepted input did not resolve to canonical identity: %q %v", canonical, err)
	}

	account, err := s.Store.Get(ctx, project, "connections", connection)
	if err != nil {
		t.Fatal(err)
	}

	if err = s.recordMarketingPreference(ctx, project, account, input, "", "stopped", "", "meta_webhook", "alias-stop", time.Now().UTC()); err != nil {
		t.Fatal(err)
	}

	if _, err = s.Store.Pool.Exec(ctx, `INSERT INTO template_states(project_id,business_account_id,template_id,data) VALUES($1,'772000','promo','{"id":"promo","name":"promo","language":"es","category":"MARKETING","status":"APPROVED"}')`, project); err != nil {
		t.Fatal(err)
	}

	status, out = request(t, h.URL, key, "POST", "/v1/messages", store.Object{"connection_id": connection, "payload": store.Object{"to": identity, "type": "template", "template": store.Object{"name": "promo", "language": store.Object{"code": "es"}}}}, "alias-marketing")
	expect(t, status, 422, out)

	if str(object(out, "error"), "code") != "marketing_preference_stopped" || calls != 1 {
		t.Fatalf("recipient mapping bypassed marketing suppression: %#v calls=%d", out, calls)
	}
}

func TestWhatsAppRecipientEvidence(t *testing.T) {
	s, _, project, _ := fixture(t)
	ctx := context.Background()
	input, identity := "541132647689", "5491132647689"

	for _, test := range []struct {
		name, state, receiptState, want string
	}{
		{"delivered", "delivered", "delivered", input},
		{"read", "read", "read", input},
		{"failed", "failed", "failed", identity},
		{"pending", "pending", "sent", identity},
	} {
		t.Run(test.name, func(t *testing.T) {
			connection := store.ID("con")
			id := store.ID("msg")
			message := store.Object{"id": id, "channel": "whatsapp", "connection_id": connection, "direction": "outbound", "status": test.state, "payload": store.Object{"to": input}, "statuses": []any{store.Object{"status": test.receiptState, "recipient_id": identity}}}

			if err := s.Store.Put(ctx, project, "messages", id, message, true); err != nil {
				t.Fatal(err)
			}

			got, canonical, err := s.Store.WhatsAppRecipient(ctx, project, connection, identity)
			if err != nil || got != test.want || canonical != identity {
				t.Fatalf("unexpected mapping: %q %q %v", got, canonical, err)
			}
		})
	}
}

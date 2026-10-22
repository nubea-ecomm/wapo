package api

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func TestInboxReadStateIsScopedMonotonicAndIndependentOfOpenState(t *testing.T) {
	s, h, p, key := fixture(t)
	ctx := context.Background()
	connection := store.ID("con")
	id := store.ConversationID(connection, "15550000001")

	if err := s.Store.Put(ctx, p, "conversations", id, store.Object{"id": id, "connection_id": connection, "channel": "whatsapp", "contact": "15550000001", "status": "open"}, true); err != nil {
		t.Fatal(err)
	}

	for index, message := range []string{"inbound-a", "inbound-b"} {
		if err := s.Store.Put(ctx, p, "messages", message, store.Object{"id": message, "connection_id": connection, "conversation_id": id, "direction": "inbound", "channel": "whatsapp", "status": "received"}, true); err != nil {
			t.Fatal(err)
		}

		if _, err := s.Store.Pool.Exec(ctx, "UPDATE resources SET created_at=now()-interval '1 hour'+$3*interval '1 second' WHERE project_id=$1 AND kind='messages' AND id=$2", p, message, index); err != nil {
			t.Fatal(err)
		}
	}

	path := "/v1/conversations/" + id
	status, out := request(t, h.URL, key, "GET", path, nil, "")
	expect(t, status, 200, out)

	if object(out, "data")["has_unread"] != true {
		t.Fatal("inbound messages should be unread")
	}

	status, out = request(t, h.URL, key, "POST", path+"/read", store.Object{"message_id": "inbound-a"}, "")
	expect(t, status, 200, out)

	if object(out, "data")["has_unread"] != true {
		t.Fatal("marking an earlier message hid a newer message")
	}

	status, out = request(t, h.URL, key, "POST", path+"/read", store.Object{"message_id": "inbound-b"}, "")
	expect(t, status, 200, out)

	if object(out, "data")["has_unread"] != false {
		t.Fatal("read marker did not clear unread state")
	}

	status, out = request(t, h.URL, key, "POST", path+"/read", store.Object{"message_id": "inbound-a"}, "")
	expect(t, status, 200, out)

	if object(out, "data")["has_unread"] != false {
		t.Fatal("read cursor moved backwards")
	}

	second := store.ID("key")
	if err := s.Store.Bootstrap(ctx, p, second); err != nil {
		t.Fatal(err)
	}

	status, out = request(t, h.URL, second, "GET", path, nil, "")
	expect(t, status, 200, out)

	if object(out, "data")["has_unread"] != true {
		t.Fatal("read state leaked across readers")
	}

	status, out = request(t, h.URL, key, "POST", path+"/read", store.Object{"message_id": "unrelated"}, "")
	expect(t, status, 404, out)
	_, _, _, otherKey := fixture(t)
	status, out = request(t, h.URL, otherKey, "POST", path+"/read", store.Object{"message_id": "inbound-b"}, "")
	expect(t, status, 404, out)

	if !projectPermission(store.ConsoleUser{Role: "viewer"}, httptest.NewRequest("POST", path+"/read", nil)) {
		t.Fatal("viewers must be able to mark their own inbox read")
	}

	user, err := s.Store.CreateUser(ctx, store.ID("viewer")+"@example.com", "Viewer", "test-password-12345")
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { s.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE id=$1", user.ID) })

	if _, err = s.Store.Pool.Exec(ctx, "UPDATE console_users SET role='viewer',all_projects=true WHERE id=$1", user.ID); err != nil {
		t.Fatal(err)
	}

	tokens := []string{store.ID("wapo_session"), store.ID("wapo_session")}
	for _, token := range tokens {
		if _, err = s.Store.Pool.Exec(ctx, "INSERT INTO console_sessions(hash,user_id,expires_at) VALUES($1,$2,$3)", store.Hash(token), user.ID, time.Now().Add(time.Hour)); err != nil {
			t.Fatal(err)
		}
	}

	status, out = scopedRequest(t, h.URL, tokens[0], p, "GET", path, nil)
	expect(t, status, 200, out)

	if object(out, "data")["has_unread"] != true {
		t.Fatal("API credential read marker leaked to console user")
	}

	status, out = scopedRequest(t, h.URL, tokens[0], p, "POST", path+"/read", store.Object{"message_id": "inbound-b"})
	expect(t, status, 200, out)
	status, out = scopedRequest(t, h.URL, tokens[1], p, "GET", path, nil)
	expect(t, status, 200, out)

	if object(out, "data")["has_unread"] != false {
		t.Fatal("console user read marker did not survive a second session")
	}
}

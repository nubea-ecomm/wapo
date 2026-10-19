package api

import (
	"context"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func TestCustomerMetricsIsolationPeriodsAndStatusCounts(t *testing.T) {
	s, h, p, key := fixture(t)
	ctx := context.Background()
	put := func(kind, id string, o store.Object) {
		t.Helper()

		o["id"] = id
		if e := s.Store.Put(ctx, p, kind, id, o, true); e != nil {
			t.Fatal(e)
		}
	}

	for _, id := range []string{"merchant-a", "merchant-b"} {
		put("customers", id, store.Object{"name": id})
	}

	for _, id := range []string{"a", "b"} {
		put("connections", id, store.Object{"customer_id": "merchant-" + id, "channel": "whatsapp", "business_account_id": store.ID("account"), "connection_type": "coexistence", "status": "connected"})
	}

	for id, status := range map[string]string{"sent": "sent", "delivered": "delivered", "read": "read", "failed": "failed", "pending": "pending", "inbound": "received", "old": "sent", "other": "sent"} {
		direction := "outbound"
		connection := "a"

		if id == "inbound" {
			direction = "inbound"
		}

		if id == "other" {
			connection = "b"
		}

		put("messages", id, store.Object{"connection_id": connection, "channel": "whatsapp", "direction": direction, "status": status})
	}

	_, e := s.Store.Pool.Exec(ctx, "UPDATE resources SET created_at=$2 WHERE project_id=$1 AND kind='messages' AND id='old'", p, time.Now().UTC().AddDate(0, 0, -10))
	if e != nil {
		t.Fatal(e)
	}

	put("conversations", "chat-a", store.Object{"connection_id": "a", "status": "open"})

	status, body := request(t, h.URL, key, "GET", "/v1/customers/merchant-a/metrics?days=7", nil, "")
	expect(t, status, 200, body)
	d := object(body, "data")
	for name, want := range map[string]float64{"sent": 3, "received": 1, "outbound": 5, "failed": 1, "pending": 1, "delivered": 2, "read": 1, "connections": 1, "connected": 1, "conversations": 1, "open_conversations": 1} {
		if d[name] != want {
			t.Fatalf("%s=%v, want %v", name, d[name], want)
		}
	}

	if len(d["series"].([]any)) != 7 || object(d, "connection_types")["coexistence"] != float64(1) {
		t.Fatal("incorrect series or connection types")
	}

	status, body = request(t, h.URL, key, "GET", "/v1/customers/merchant-a/metrics?days=30", nil, "")
	expect(t, status, 200, body)

	if object(body, "data")["sent"] != float64(4) {
		t.Fatal("period excluded old message")
	}

	_, _, _, foreignKey := fixture(t)
	status, body = request(t, h.URL, foreignKey, "GET", "/v1/customers/merchant-a/metrics", nil, "")
	expect(t, status, 404, body)
	status, body = request(t, h.URL, key, "GET", "/v1/customers/merchant-a/metrics?days=800", nil, "")
	expect(t, status, 422, body)
	status, body = request(t, h.URL, key, "POST", "/v1/customers/merchant-a/metrics", store.Object{}, "")
	expect(t, status, 405, body)
}

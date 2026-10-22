package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func metaTestConnection(t *testing.T, s *Server, p, waba, phone string) store.Object {
	t.Helper()

	c := store.Object{"id": store.ID("con"), "channel": "whatsapp", "status": "connected", "external_id": phone, "business_account_id": waba, "access_token": s.Store.Seal("", p)}
	if err := s.Store.Put(context.Background(), p, "connections", str(c, "id"), c, true); err != nil {
		t.Fatal(err)
	}

	return c
}

func postMetaWebhook(t *testing.T, base, path string, payload store.Object, secret string) (int, []byte) {
	t.Helper()
	// The signature covers the original whitespace, not the routed serialization.
	raw, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatal(err)
	}

	req, _ := http.NewRequest("POST", base+path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Hub-Signature-256", "sha256="+delivery.Signature(raw, secret))
	req.Header.Set("X-Tenant-ID", "must-not-control-provider-routing")

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	data, _ := io.ReadAll(res.Body)

	return res.StatusCode, data
}

func metaInboundChange(phone, id string) store.Object {
	return store.Object{"field": "messages", "value": store.Object{"metadata": store.Object{"phone_number_id": phone}, "messages": []any{store.Object{"id": id, "from": "15550001111", "type": "text", "text": store.Object{"body": "Inbound"}}}}}
}

func TestGlobalMetaWebhookRoutesMixedProjectsAndAccountEvents(t *testing.T) {
	s, h, p1, _ := fixture(t)
	_, _, p2, _ := fixture(t)
	ctx := context.Background()
	c1 := metaTestConnection(t, s, p1, "waba-"+p1, "phone-"+p1)
	c2 := metaTestConnection(t, s, p2, "waba-"+p2, "phone-"+p2)

	for _, p := range []string{p1, p2} {
		if err := s.Store.Put(ctx, p, "webhooks", "sub-"+p, store.Object{"id": "sub-" + p, "url": "https://fake-receiver.invalid", "events": []any{"*"}, "active": true}, true); err != nil {
			t.Fatal(err)
		}
	}

	if _, err := s.Store.Pool.Exec(ctx, "UPDATE projects SET status='suspended' WHERE id=$1", p2); err != nil {
		t.Fatal(err)
	}

	batch := store.Object{"object": "whatsapp_business_account", "entry": []any{
		store.Object{"id": c1["business_account_id"], "changes": []any{metaInboundChange(str(c1, "external_id"), "wamid.shared"), store.Object{"field": "history", "value": store.Object{"metadata": store.Object{"phone_number_id": c1["external_id"]}, "history": []any{store.Object{"threads": []any{}}}}}}},
		store.Object{"id": c2["business_account_id"], "changes": []any{metaInboundChange(str(c2, "external_id"), "wamid.shared"), store.Object{"field": "account_update", "value": store.Object{"event": "ACCOUNT_REVIEW_UPDATE"}}, store.Object{"field": "message_template_status_update", "value": store.Object{"message_template_id": json.Number("9007199254740999"), "message_template_name": "hello", "message_template_language": "es", "event": "APPROVED"}}}},
	}}
	counts := map[string]int{}

	for attempt := 0; attempt < 2; attempt++ {
		status, body := postMetaWebhook(t, h.URL, "/hooks/meta", batch, s.Config.MetaAppSecret)
		if status != 200 {
			t.Fatalf("global batch failed: %d %s", status, body)
		}

		for _, item := range []struct {
			p string
			c store.Object
		}{{p1, c1}, {p2, c2}} {
			message, err := s.Store.Get(ctx, item.p, "messages", "wamid.shared")
			if err != nil || str(message, "connection_id") != str(item.c, "id") {
				t.Fatalf("message crossed project boundary: %#v %v", message, err)
			}

			var events, jobs, foreign int

			if err = s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM events WHERE project_id=$1", item.p).Scan(&events); err != nil {
				t.Fatal(err)
			}

			if err = s.Store.Pool.QueryRow(ctx, "SELECT count(*),count(*) FILTER(WHERE subscription_id<>$2) FROM deliveries WHERE project_id=$1", item.p, "sub-"+item.p).Scan(&jobs, &foreign); err != nil {
				t.Fatal(err)
			}

			if events < 2 || events != jobs || foreign != 0 {
				t.Fatalf("event/outbox routing failed: %d %d %d", events, jobs, foreign)
			}

			if attempt == 1 && counts[item.p] != events {
				t.Fatal("batch replay duplicated events")
			}

			counts[item.p] = events
		}
	}

	var state string

	if err := s.Store.Pool.QueryRow(ctx, "SELECT data->>'status' FROM template_states WHERE project_id=$1 AND business_account_id=$2 AND template_id='9007199254740999'", p2, str(c2, "business_account_id")).Scan(&state); err != nil || state != "APPROVED" {
		t.Fatalf("account-level template event lost routing or numeric precision: %q %v", state, err)
	}
}

func TestGlobalMetaWebhookRejectsConflictingOwnershipBeforeWrites(t *testing.T) {
	s, h, p1, _ := fixture(t)
	_, _, p2, _ := fixture(t)
	c1 := metaTestConnection(t, s, p1, "waba-"+p1, "phone-"+p1)
	c2 := metaTestConnection(t, s, p2, "waba-"+p2, "phone-"+p2)
	batch := store.Object{"entry": []any{
		store.Object{"id": c1["business_account_id"], "changes": []any{metaInboundChange(str(c1, "external_id"), "must-not-write")}},
		store.Object{"id": c1["business_account_id"], "changes": []any{metaInboundChange(str(c2, "external_id"), "cross-project")}},
	}}
	status, body := postMetaWebhook(t, h.URL, "/hooks/meta", batch, s.Config.MetaAppSecret)

	if status != 400 {
		t.Fatalf("ownership conflict was accepted: %d %s", status, body)
	}

	for _, p := range []string{p1, p2} {
		var count int

		if err := s.Store.Pool.QueryRow(context.Background(), "SELECT count(*) FROM events WHERE project_id=$1", p).Scan(&count); err != nil || count != 0 {
			t.Fatalf("invalid batch partially persisted: %d %v", count, err)
		}
	}

	status, _ = postMetaWebhook(t, h.URL, "/hooks/meta", batch, "wrong-secret")
	if status != 401 {
		t.Fatal("unsigned batch reached routing")
	}
}

func TestGlobalMetaWebhookPhoneFallbackUnknownAssetsAndLegacyScope(t *testing.T) {
	s, h, p1, _ := fixture(t)
	_, _, p2, _ := fixture(t)
	c := metaTestConnection(t, s, p1, "waba-"+p1, "phone-"+p1)
	batch := store.Object{"entry": []any{store.Object{"changes": []any{metaInboundChange(str(c, "external_id"), "fallback")}}}}
	status, body := postMetaWebhook(t, h.URL, "/hooks/meta/"+p2, batch, s.Config.MetaAppSecret)

	if status != 200 {
		t.Fatalf("legacy endpoint failed: %d %s", status, body)
	}

	if _, err := s.Store.Get(context.Background(), p1, "messages", "fallback"); err == nil {
		t.Fatal("legacy endpoint escaped its project scope")
	}

	status, body = postMetaWebhook(t, h.URL, "/hooks/meta", batch, s.Config.MetaAppSecret)
	if status != 200 {
		t.Fatalf("phone-only routing failed: %d %s", status, body)
	}

	if _, err := s.Store.Get(context.Background(), p1, "messages", "fallback"); err != nil {
		t.Fatal(err)
	}

	unknown := store.Object{"entry": []any{store.Object{"id": "unknown-waba", "changes": []any{metaInboundChange("unknown-phone", "unknown")}}}}
	status, body = postMetaWebhook(t, h.URL, "/hooks/meta", unknown, s.Config.MetaAppSecret)

	if status != 200 {
		t.Fatalf("unknown assets should be acknowledged: %d %s", status, body)
	}

	if _, err := s.Store.Get(context.Background(), p1, "messages", "unknown"); err == nil {
		t.Fatal("unknown event assigned to a default project")
	}

	status, _ = postMetaWebhook(t, h.URL, "/hooks/meta", store.Object{"entry": "invalid"}, s.Config.MetaAppSecret)
	if status != 400 {
		t.Fatal("malformed envelope accepted")
	}

	status, _ = postMetaWebhook(t, h.URL, "/hooks/meta/"+p1, batch, s.Config.MetaAppSecret)
	if status != 200 {
		t.Fatal("correct legacy callback stopped working")
	}
}

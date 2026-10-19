package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
	"wapo.local/server/internal/templatesync"
)

func TestTemplateChangesAreAtomicDeduplicatedAndScoped(t *testing.T) {
	s, h, p, key := fixture(t)
	ctx := context.Background()
	waba := "lifecycle-waba"
	c := "life-connection"
	must := func(e error) {
		t.Helper()
		if e != nil {
			t.Fatal(e)
		}
	}
	must(s.Store.Put(ctx, p, "connections", c, store.Object{"id": c, "channel": "whatsapp", "business_account_id": waba, "access_token": s.Store.Seal("provider-secret", p), "status": "connected"}, true))
	for _, id := range []string{"project-sub", "phone-sub"} {
		sub := store.Object{"id": id, "url": "https://hooks.example/events", "events": []any{"whatsapp.template.status_changed", "whatsapp.template.category_changed", "whatsapp.template.category_change_scheduled"}, "active": true, "secret_key": s.Store.Seal("test-only-signing-secret", p)}
		if id == "phone-sub" {
			sub["connection_id"] = c
		}
		must(s.Store.Put(ctx, p, "webhooks", id, sub, true))
	}
	initial := store.Object{"id": "tpl1", "name": "order", "status": "PENDING", "category": "MARKETING"}
	must(templatesync.Observe(ctx, s.Store, p, waba, c, initial, "api", time.Now(), 0))
	var count int
	must(s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM events WHERE project_id=$1", p).Scan(&count))
	if count != 0 {
		t.Fatal("baseline emitted change")
	}
	send := func(field string, value store.Object, at int64) {
		t.Helper()
		body := store.Object{"entry": []any{store.Object{"id": waba, "time": at, "changes": []any{store.Object{"field": field, "value": value}}}}}
		raw, _ := json.Marshal(body)
		req, _ := http.NewRequest("POST", h.URL+"/hooks/meta/"+p, bytes.NewReader(raw))
		req.Header.Set("X-Hub-Signature-256", "sha256="+delivery.Signature(raw, s.Config.MetaAppSecret))
		res, e := http.DefaultClient.Do(req)
		must(e)
		io.Copy(io.Discard, res.Body)
		res.Body.Close()
		if res.StatusCode != 200 {
			t.Fatal(res.StatusCode)
		}
	}
	at := time.Now().Unix()
	approved := store.Object{"message_template_id": "tpl1", "event": "APPROVED"}
	send("message_template_status_update", approved, at)
	send("message_template_status_update", approved, at)
	send("template_category_update", store.Object{"message_template_id": "tpl1", "previous_category": "MARKETING", "new_category": "UTILITY"}, at+1)
	send("message_template_status_update", store.Object{"message_template_id": "tpl1", "event": "PENDING"}, at-1)
	must(s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM events WHERE project_id=$1", p).Scan(&count))
	if count != 2 {
		t.Fatalf("got %d events", count)
	}
	must(s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM deliveries WHERE project_id=$1", p).Scan(&count))
	if count != 4 {
		t.Fatalf("got %d deliveries", count)
	}
	code, body := request(t, h.URL, key, "GET", "/v1/connections/"+c+"/templates/tpl1/history", nil, "")
	expect(t, code, 200, body)
	if len(body["data"].([]any)) != 2 {
		t.Fatal(body)
	}
	// A poll sees the same values without another event; an older snapshot cannot roll them back.
	must(templatesync.Observe(ctx, s.Store, p, waba, c, store.Object{"id": "tpl1", "status": "PENDING"}, "poll", time.Now().Add(-time.Hour), 0))
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer provider-secret" {
			t.Error("wrong token")
		}
		write(w, 200, store.Object{"data": []any{store.Object{"id": "tpl1", "status": "APPROVED", "category": "UTILITY"}}})
	}))
	defer meta.Close()
	s.Meta.BaseURL = meta.URL
	s.Meta.Version = "v24.0"
	must(templatesync.Sync(ctx, s.Store, s.Meta, p, waba))
	must(s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM events WHERE project_id=$1", p).Scan(&count))
	if count != 2 {
		t.Fatal("poll duplicated webhook transition")
	}
	send("template_category_update", store.Object{"message_template_id": "tpl1", "current_category": "UTILITY", "correct_category": "MARKETING", "category_update_timestamp": at + 3600}, at+2)
	var data []byte
	must(s.Store.Pool.QueryRow(ctx, "SELECT data FROM template_states WHERE project_id=$1 AND template_id='tpl1'", p).Scan(&data))
	var state store.Object
	json.Unmarshal(data, &state)
	if str(state, "category") != "UTILITY" || str(state, "scheduled_category") != "MARKETING" {
		t.Fatal("scheduled change applied too early")
	}
	must(templatesync.Observe(ctx, s.Store, p, waba, c, store.Object{"id": "tpl1", "category": "MARKETING"}, "poll", time.Now(), 0))
	must(s.Store.Pool.QueryRow(ctx, "SELECT data FROM template_states WHERE project_id=$1 AND template_id='tpl1'", p).Scan(&data))
	json.Unmarshal(data, &state)
	if str(state, "category") != "MARKETING" || state["scheduled_category"] != nil {
		t.Fatal("reconciliation did not apply and clear scheduled category")
	}
	must(s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM events WHERE project_id=$1", p).Scan(&count))
	if count != 4 {
		t.Fatalf("reconciliation generated %d events instead of four", count)
	}
	_, _, _, foreign := fixture(t)
	code, body = request(t, h.URL, foreign, "GET", "/v1/connections/"+c+"/templates/tpl1/history", nil, "")
	expect(t, code, 404, body)
}

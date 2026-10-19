package api

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"wapo.local/server/internal/store"
)

func TestObservabilityFiltersPaginationAndSecretBoundaries(t *testing.T) {
	server, h, p, key := fixture(t)
	ctx := context.Background()
	status, o := request(t, h.URL, key, "GET", "/v1/missing?api_key=never-log-this", nil, "")
	expect(t, status, 404, o)
	status, o = request(t, h.URL, key, "GET", "/v1/logs?source=api&errors_only=true", nil, "")
	expect(t, status, 200, o)
	rows := o["data"].([]any)
	if len(rows) != 1 {
		t.Fatalf("unexpected logs %v", o)
	}
	entry := rows[0].(map[string]any)
	if entry["http_status"] != float64(404) || entry["duration_ms"] == nil || entry["request_id"] == "" {
		t.Fatal("missing request telemetry")
	}
	raw, _ := json.Marshal(o)
	if strings.Contains(string(raw), "never-log-this") || strings.Contains(string(raw), key) {
		t.Fatal("request secrets leaked")
	}
	status, o = request(t, h.URL, key, "GET", "/v1/logs/"+entry["id"].(string), nil, "")
	expect(t, status, 200, o)
	_, e := server.Store.Pool.Exec(ctx, `INSERT INTO events(id,project_id,source_key,name,payload) SELECT 'telemetry_'||g::text,$1,'telemetry:'||g::text,'whatsapp.message.received','{"data":{"access_token":"sensitive-value","nested":{"password":"private-value"}},"event":"whatsapp.message.received"}'::jsonb FROM generate_series(1,101) g`, p)
	if e != nil {
		t.Fatal(e)
	}
	status, o = request(t, h.URL, key, "GET", "/v1/logs?source=meta&range=1h&search=received", nil, "")
	expect(t, status, 200, o)
	rows = o["data"].([]any)
	if len(rows) != 100 {
		t.Fatalf("pagination failed %d", len(rows))
	}
	after := str(object(o, "meta"), "after")
	if after == "" {
		t.Fatal("missing cursor")
	}
	firstID := rows[0].(map[string]any)["id"].(string)
	status, o = request(t, h.URL, key, "GET", "/v1/logs?source=meta&range=1h&search=received&after="+after, nil, "")
	expect(t, status, 200, o)
	if len(o["data"].([]any)) != 1 {
		t.Fatal("incorrect second page")
	}
	status, o = request(t, h.URL, key, "GET", "/v1/logs/"+firstID, nil, "")
	expect(t, status, 200, o)
	raw, _ = json.Marshal(o)
	if strings.Contains(string(raw), "sensitive-value") || strings.Contains(string(raw), "private-value") || !strings.Contains(string(raw), "[redacted]") {
		t.Fatal("payload not redacted")
	}
	other, otherKey := store.ID("logs-other"), store.ID("key")
	if e = server.Store.Bootstrap(ctx, other, otherKey); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		server.Store.Pool.Exec(ctx, "DELETE FROM api_keys WHERE project_id=$1", other)
		server.Store.Pool.Exec(ctx, "DELETE FROM projects WHERE id=$1", other)
	})
	status, o = request(t, h.URL, otherKey, "GET", "/v1/logs/"+firstID, nil, "")
	expect(t, status, 404, o)
	for _, query := range []string{"source=bogus", "range=all", "errors_only=maybe"} {
		status, o = request(t, h.URL, key, "GET", "/v1/logs?"+query, nil, "")
		expect(t, status, 422, o)
	}
	status, o = request(t, h.URL, key, "GET", "/v1/logs?after=invalid", nil, "")
	expect(t, status, 400, o)
}

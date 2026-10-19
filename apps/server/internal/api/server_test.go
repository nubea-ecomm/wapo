package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"wapo.local/server/internal/config"
	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func fixture(t *testing.T) (*Server, *httptest.Server, string, string) {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run PostgreSQL integration tests")
	}

	ctx := context.Background()

	s, e := store.Open(ctx, dsn, bytes.Repeat([]byte{7}, 32), store.Options{AuthCacheTTL: 5 * time.Second, AuthCacheEntries: 1000})
	if e != nil {
		t.Fatal(e)
	}

	t.Cleanup(s.Pool.Close)

	if e = s.Migrate(ctx, "../../migrations/001_initial.sql"); e != nil {
		t.Fatal(e)
	}

	p := store.ID("test")
	key := store.ID("testkey")

	if e = s.Bootstrap(ctx, p, key); e != nil {
		t.Fatal(e)
	}

	t.Cleanup(func() {
		s.Pool.Exec(ctx, "DELETE FROM deliveries WHERE project_id=$1", p)
		s.Pool.Exec(ctx, "DELETE FROM events WHERE project_id=$1", p)
		s.Pool.Exec(ctx, "DELETE FROM requests WHERE project_id=$1", p)
		s.Pool.Exec(ctx, "DELETE FROM resources WHERE project_id=$1", p)
		s.Pool.Exec(ctx, "DELETE FROM api_keys WHERE project_id=$1", p)
		s.Pool.Exec(ctx, "DELETE FROM projects WHERE id=$1", p)
	})

	server := New(s, config.Config{Channels: []string{"whatsapp", "webchat"}, WebOrigin: "http://localhost:5173", MetaAppSecret: "meta-test-secret", MetaVerifyToken: "verify-token", AllowPrivateWebhooks: true, RequestLogSampleRate: 1})
	t.Cleanup(server.Close)
	httpServer := httptest.NewServer(server.Handler())
	t.Cleanup(httpServer.Close)

	return server, httpServer, p, key
}

func request(t *testing.T, base, key, method, path string, body any, idem string) (int, store.Object) {
	t.Helper()

	var b []byte

	if body != nil {
		b, _ = json.Marshal(body)
	}

	req, e := http.NewRequest(method, base+path, bytes.NewReader(b))
	if e != nil {
		t.Fatal(e)
	}

	req.Header.Set("X-API-Key", key)
	req.Header.Set("Content-Type", "application/json")

	if idem != "" {
		req.Header.Set("Idempotency-Key", idem)
	}

	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()

	var o store.Object

	if res.StatusCode == http.StatusNoContent {
		return res.StatusCode, o
	}

	if e = json.NewDecoder(res.Body).Decode(&o); e != nil {
		t.Fatalf("HTTP %d: %v", res.StatusCode, e)
	}

	return res.StatusCode, o
}

func expect(t *testing.T, got, want int, body any) {
	t.Helper()

	if got != want {
		t.Fatalf("HTTP %d, want %d: %#v", got, want, body)
	}
}

func TestProjectIsolationAndIdempotency(t *testing.T) {
	server, h, p, key := fixture(t)
	status, o := request(t, h.URL, "bad", "GET", "/v1/me", nil, "")
	expect(t, status, 401, o)
	status, o = request(t, h.URL, key, "POST", "/v1/connections", store.Object{"name": "Demo", "channel": "webchat"}, "")
	expect(t, status, 201, o)
	id := str(object(o, "data"), "id")
	payload := store.Object{"connection_id": id, "payload": store.Object{"to": "visitor", "type": "text", "text": store.Object{"body": "Hello"}}}
	status, o = request(t, h.URL, key, "POST", "/v1/messages", payload, "send-1")
	expect(t, status, 201, o)
	messageID := str(object(o, "data"), "id")
	status, o = request(t, h.URL, key, "POST", "/v1/messages", payload, "send-1")
	expect(t, status, 201, o)

	if str(object(o, "data"), "id") != messageID {
		t.Fatal("replay sent a new message")
	}

	payload["payload"].(store.Object)["to"] = "different"
	status, o = request(t, h.URL, key, "POST", "/v1/messages", payload, "send-1")
	expect(t, status, 409, o)

	var count int

	server.Store.Pool.QueryRow(context.Background(), "SELECT count(*) FROM resources WHERE project_id=$1 AND kind='messages'", p).Scan(&count)

	if count != 1 {
		t.Fatalf("got %d messages", count)
	}

	_, other, _, otherKey := fixture(t)
	_ = other
	// Both projects are in the same database, but the first server must enforce the other key's scope.
	status, o = request(t, h.URL, otherKey, "GET", "/v1/connections/"+id, nil, "")
	expect(t, status, 404, o)
	status, o = request(t, h.URL, key, "GET", "/v1/messages?after=invalid", nil, "")
	expect(t, status, 400, o)
	status, o = request(t, h.URL, key, "POST", "/v1/customers", store.Object{"name": "A", "external_customer_id": "shop-1"}, "")
	expect(t, status, 201, o)
	status, o = request(t, h.URL, key, "POST", "/v1/customers", store.Object{"name": "B", "external_customer_id": "shop-1"}, "")
	expect(t, status, 422, o)
}

func TestMetaIngressDeduplicatesAndDeliversSignedEvents(t *testing.T) {
	server, h, p, key := fixture(t)
	ctx := context.Background()
	c := store.Object{"id": "con-test", "channel": "whatsapp", "external_id": "123456", "business_account_id": "654321", "access_token": server.Store.Seal("token", p), "inbound_processing_enabled": true}

	if e := server.Store.Put(ctx, p, "connections", "con-test", c, true); e != nil {
		t.Fatal(e)
	}

	delivered := make(chan []byte, 10)
	secret := "subscription-secret-123"
	receiver := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		if !delivery.Verify(b, secret, r.Header.Get("X-Webhook-Signature")) {
			t.Error("invalid downstream signature")
		}

		if r.Header.Get("X-Idempotency-Key") == "" {
			t.Error("missing dedup key")
		}

		delivered <- b

		w.WriteHeader(204)
	}))

	defer receiver.Close()

	status, o := request(t, h.URL, key, "POST", "/platform/v1/whatsapp/phone_numbers/123456/webhooks", store.Object{"whatsapp_webhook": store.Object{"url": receiver.URL, "secret_key": secret, "events": []string{"whatsapp.message.received", "whatsapp.message.delivered", "whatsapp.message.read"}}}, "")
	expect(t, status, 201, o)

	if object(o, "data")["secret_key"] != nil {
		t.Fatal("secret exposed")
	}

	raw := []byte(`{"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"123456"},"contacts":[{"wa_id":"549111","profile":{"name":"Ana"}}],"messages":[{"id":"wamid.inbound","from":"549111","type":"text","text":{"body":"Hola"},"timestamp":"1700000000"}]}}]}]}`)
	post := func(raw []byte, sig string) int {
		req, _ := http.NewRequest("POST", h.URL+"/hooks/meta/"+p, bytes.NewReader(raw))
		req.Header.Set("X-Hub-Signature-256", "sha256="+sig)

		res, e := http.DefaultClient.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		defer res.Body.Close()

		return res.StatusCode
	}

	if post(raw, "invalid") != 401 {
		t.Fatal("accepted forged event")
	}

	for i := 0; i < 2; i++ {
		if code := post(raw, delivery.Signature(raw, "meta-test-secret")); code != 200 {
			t.Fatalf("ingress HTTP %d", code)
		}
	}

	var count int

	server.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM events WHERE project_id=$1", p).Scan(&count)

	if count != 1 {
		t.Fatalf("duplicate persisted: %d", count)
	}

	echo := []byte(`{"entry":[{"id":"654321","changes":[{"field":"smb_message_echoes","value":{"metadata":{"phone_number_id":"123456"},"message_echoes":[{"id":"wamid.echo","from":"123456","to":"549111","type":"text","text":{"body":"From Business App"},"timestamp":"1700000001"}]}},{"field":"history","value":{"metadata":{"phone_number_id":"123456"},"history":[{"threads":[]}]}},{"field":"smb_app_state_sync","value":{"metadata":{"phone_number_id":"123456"},"state_sync":[]}}]}]}`)
	for i := 0; i < 2; i++ {
		if post(echo, delivery.Signature(echo, "meta-test-secret")) != 200 {
			t.Fatal("coexistence ingress failed")
		}
	}

	status, o = request(t, h.URL, key, "GET", "/v1/messages/wamid.echo", nil, "")
	expect(t, status, 200, o)

	if str(object(o, "data"), "direction") != "outbound" {
		t.Fatal("Business App echo mapped as inbound")
	}

	status, o = request(t, h.URL, key, "GET", "/v1/events", nil, "")
	expect(t, status, 200, o)

	if len(o["data"].([]any)) != 4 {
		t.Fatal("Coexistence snapshots were lost or duplicated")
	}

	workerCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})

	go func() { delivery.Run(workerCtx, server.Store, true); close(done) }()

	defer func() { cancel(); <-done }()

	select {
	case b := <-delivered:
		var event store.Object

		json.Unmarshal(b, &event)

		if str(event, "phone_number_id") != "123456" || str(event, "event") != "whatsapp.message.received" {
			t.Fatalf("incompatible legacy envelope: %s", b)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("outbox did not deliver")
	}

	for _, state := range []string{"read", "delivered"} {
		raw := []byte(fmt.Sprintf(`{"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"123456"},"statuses":[{"id":"wamid.outbound","recipient_id":"549111","status":"%s","timestamp":"1700000001"}]}}]}]}`, state))
		if post(raw, delivery.Signature(raw, "meta-test-secret")) != 200 {
			t.Fatal("status failed")
		}
	}

	status, o = request(t, h.URL, key, "GET", "/platform/v1/whatsapp/messages?phone_number_id=123456&direction=outbound", nil, "")
	expect(t, status, 200, o)
	rows := o["data"].([]any)

	var row store.Object

	for _, value := range rows {
		candidate := value.(map[string]any)
		if candidate["id"] == "wamid.outbound" {
			row = candidate
		}
	}

	if str(object(row, "compatibility"), "status") != "read" {
		t.Fatal("delivery state regressed")
	}
}

func TestBridgeScopeAndRawContract(t *testing.T) {
	server, h, p, key := fixture(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-API-Key") != "upstream-secret" || r.Header.Get("Authorization") != "" {
			t.Error("upstream credential boundary broken")
		}

		if strings.Contains(r.URL.RawQuery, "access_token") {
			t.Error("caller token forwarded")
		}

		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"data":{"id":"upstream-customer"}}`)
	}))

	defer upstream.Close()

	server.Config.BridgeProject = p
	server.Config.BridgeKey = "upstream-secret"
	server.Config.BridgePlatformURL = upstream.URL + "/platform/v1"
	status, o := request(t, h.URL, key, "POST", "/platform/v1/customers", store.Object{"customer": store.Object{"name": "A"}}, "")
	expect(t, status, 200, o)

	if str(object(o, "data"), "id") != "upstream-customer" {
		t.Fatal(o)
	}

	_, _, _, otherKey := fixture(t)
	status, o = request(t, h.URL, otherKey, "POST", "/platform/v1/customers", store.Object{"customer": store.Object{"name": "B"}}, "")
	expect(t, status, 201, o)

	if str(object(o, "data"), "id") == "upstream-customer" {
		t.Fatal("cross-project bridge access")
	}
}

package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func TestTenantKeysRevocationAndOperatorScoping(t *testing.T) {
	server, h, p, key := fixture(t)
	adminKey := store.ID("operator")
	server.Config.AdminKey = adminKey
	status, o := request(t, h.URL, key, "GET", "/admin/v1/tenants", nil, "")
	expect(t, status, 401, o)
	status, o = request(t, h.URL, adminKey, "POST", "/admin/v1/tenants", store.Object{"name": "Isolated tenant"}, "")
	expect(t, status, 201, o)
	var audits int
	if e := server.Store.Pool.QueryRow(context.Background(), "SELECT count(*) FROM admin_audit_logs WHERE actor_type='technical' AND actor_id='admin_api_key' AND method='POST' AND path='/admin/v1/tenants' AND status=201").Scan(&audits); e != nil || audits != 1 {
		t.Fatalf("admin action was not audited: count=%d error=%v", audits, e)
	}
	tenant := str(object(o, "data"), "id")
	t.Cleanup(func() {
		server.Store.Pool.Exec(context.Background(), "DELETE FROM api_keys WHERE project_id=$1", tenant)
		server.Store.Pool.Exec(context.Background(), "DELETE FROM projects WHERE id=$1", tenant)
	})
	status, o = request(t, h.URL, adminKey, "POST", "/admin/v1/tenants/"+tenant+"/api_keys", store.Object{"name": "Integration"}, "")
	expect(t, status, 201, o)
	created := object(o, "data")
	secret := str(created, "key")
	id := str(created, "id")
	if secret == "" {
		t.Fatal("new credential missing")
	}
	status, o = request(t, h.URL, secret, "GET", "/v1/me", nil, "")
	expect(t, status, 200, o)
	if str(object(o, "data"), "project_id") != tenant {
		t.Fatal("key belongs to wrong tenant")
	}
	status, o = request(t, h.URL, secret, "GET", "/v1/api_keys", nil, "")
	expect(t, status, 200, o)
	for _, v := range o["data"].([]any) {
		row := v.(map[string]any)
		if row["hash"] != nil || row["key"] != nil {
			t.Fatal("key material exposed")
		}
	}
	status, o = request(t, h.URL, secret, "DELETE", "/v1/api_keys/not-owned", nil, "")
	expect(t, status, 404, o)
	status, o = request(t, h.URL, adminKey, "PATCH", "/admin/v1/tenants/"+tenant, store.Object{"status": "suspended"}, "")
	expect(t, status, 200, o)
	status, o = request(t, h.URL, secret, "GET", "/v1/me", nil, "")
	expect(t, status, 401, o)
	status, o = request(t, h.URL, adminKey, "PATCH", "/admin/v1/tenants/"+tenant, store.Object{"status": "active"}, "")
	expect(t, status, 200, o)
	req, _ := http.NewRequest("GET", h.URL+"/v1/me", nil)
	req.Header.Set("X-API-Key", adminKey)
	req.Header.Set("X-Tenant-ID", p)
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatalf("operator scoped request HTTP %d", res.StatusCode)
	}
	status, o = request(t, h.URL, adminKey, "DELETE", "/admin/v1/tenants/"+tenant+"/api_keys/"+id, nil, "")
	expect(t, status, 200, o)
	status, o = request(t, h.URL, secret, "GET", "/v1/me", nil, "")
	expect(t, status, 401, o)
}

func TestMaintenanceRemovesExpiredOperationalDataAndRecoversSetupClaims(t *testing.T) {
	server, _, project, _ := fixture(t)
	ctx := context.Background()
	if _, e := server.Store.Pool.Exec(ctx, "INSERT INTO request_logs(id,project_id,request_id,method,path,status,duration_ms,created_at) VALUES('old-log',$1,'req-old','GET','/v1/me',200,1,now()-interval '31 days')", project); e != nil {
		t.Fatal(e)
	}
	if _, e := server.Store.Pool.Exec(ctx, "INSERT INTO admin_audit_logs(id,request_id,actor_type,actor_id,method,path,status,duration_ms,created_at) VALUES('old-audit','req-old','technical','admin_api_key','GET','/admin/v1/tenants',200,1,now()-interval '91 days')"); e != nil {
		t.Fatal(e)
	}
	if _, e := server.Store.Pool.Exec(ctx, "INSERT INTO requests(project_id,key,fingerprint,state,status,response,created_at) VALUES($1,'old-request','fingerprint','complete',200,'{}',now()-interval '31 days')", project); e != nil {
		t.Fatal(e)
	}
	if _, e := server.Store.Pool.Exec(ctx, "INSERT INTO events(id,project_id,source_key,name,payload,created_at) VALUES('old-event',$1,'old-source','test.event','{}',now()-interval '91 days')", project); e != nil {
		t.Fatal(e)
	}
	if e := server.Store.Put(ctx, project, "setup_links", "stale-claim", store.Object{"id": "stale-claim", "status": "processing", "completion_started_at": time.Now().Add(-time.Hour).Format(time.RFC3339Nano)}, true); e != nil {
		t.Fatal(e)
	}
	if _, e := server.Store.Pool.Exec(ctx, "INSERT INTO rate_limit_counters(scope,key_hash,window_start,count) VALUES('project','expired',now()-interval '11 minutes',1)"); e != nil {
		t.Fatal(e)
	}
	result, e := server.Store.Maintain(ctx)
	if e != nil {
		t.Fatal(e)
	}
	if result.RequestLogs != 1 || result.AuditLogs != 1 || result.Journals != 1 || result.Events != 1 || result.SetupClaims != 1 || result.RateLimits != 1 {
		t.Fatalf("unexpected maintenance result: %#v", result)
	}
	claim, e := server.Store.Get(ctx, project, "setup_links", "stale-claim")
	if e != nil || str(claim, "status") != "active" || claim["completion_started_at"] != nil {
		t.Fatalf("stale setup claim was not recovered: %#v %v", claim, e)
	}
}

func TestRateLimitIsPersistedAndDoesNotStoreRawKeys(t *testing.T) {
	server, _, _, _ := fixture(t)
	ctx := context.Background()
	for i := 0; i < 2; i++ {
		allowed, e := server.Store.AllowRequest(ctx, "test", "sensitive-client-address", 2)
		if e != nil || !allowed {
			t.Fatalf("request %d unexpectedly rejected: %v", i+1, e)
		}
	}
	allowed, e := server.Store.AllowRequest(ctx, "test", "sensitive-client-address", 2)
	if e != nil || allowed {
		t.Fatalf("request above the shared limit was accepted: %v", e)
	}
	var rawKeys int
	if e = server.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM rate_limit_counters WHERE key_hash='sensitive-client-address'").Scan(&rawKeys); e != nil || rawKeys != 0 {
		t.Fatalf("raw limiter key was persisted: count=%d error=%v", rawKeys, e)
	}
}
func TestConversationReplyCloseAssignmentAndIsolation(t *testing.T) {
	_, h, _, key := fixture(t)
	status, o := request(t, h.URL, key, "POST", "/v1/connections", store.Object{"name": "Chat", "channel": "webchat"}, "")
	expect(t, status, 201, o)
	connection := str(object(o, "data"), "id")
	status, o = request(t, h.URL, key, "POST", "/v1/messages", store.Object{"connection_id": connection, "payload": store.Object{"to": "visitor", "type": "text", "text": store.Object{"body": "First"}}}, "chat-start")
	expect(t, status, 201, o)
	id := str(object(o, "data"), "conversation_id")
	if id == "" {
		t.Fatal("message has no conversation")
	}
	status, o = request(t, h.URL, key, "POST", "/v1/conversations/"+id+"/messages", store.Object{"text": "Reply"}, "reply-1")
	expect(t, status, 201, o)
	status, o = request(t, h.URL, key, "PATCH", "/v1/conversations/"+id, store.Object{"status": "closed", "assigned_to": "Ana"}, "")
	expect(t, status, 200, o)
	status, o = request(t, h.URL, key, "GET", "/v1/conversations/"+id+"/messages", nil, "")
	expect(t, status, 200, o)
	if len(o["data"].([]any)) != 2 {
		t.Fatal("messages split into different conversations")
	}
	_, _, _, otherKey := fixture(t)
	status, o = request(t, h.URL, otherKey, "GET", "/v1/conversations/"+id+"/messages", nil, "")
	expect(t, status, 404, o)
	status, o = request(t, h.URL, key, "GET", "/v1/overview", nil, "")
	expect(t, status, 200, o)
	if object(o, "data")["sent"] != float64(2) {
		t.Fatal("overview count wrong")
	}
	// Project keys cannot opt into a different tenant by adding the operator header.
	raw, _ := json.Marshal(store.Object{})
	req, _ := http.NewRequest("GET", h.URL+"/v1/me", bytes.NewReader(raw))
	req.Header.Set("X-API-Key", key)
	req.Header.Set("X-Tenant-ID", "other")
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	res.Body.Close()
	if res.StatusCode != 200 {
		t.Fatal("normal key was incorrectly treated as operator")
	}
}

func TestWhatsAppAccountOwnershipCannotCrossTenants(t *testing.T) {
	first, _, p, _ := fixture(t)
	_, _, other, _ := fixture(t)
	ctx := context.Background()
	c := store.Object{"id": "first-phone", "channel": "whatsapp", "external_id": "777111", "business_account_id": "777000"}
	if e := first.Store.Put(ctx, p, "connections", "first-phone", c, true); e != nil {
		t.Fatal(e)
	}
	another := store.Object{"id": "second-phone", "channel": "whatsapp", "external_id": "777222", "business_account_id": "777000"}
	if e := first.Store.Put(ctx, other, "connections", "second-phone", another, true); e == nil {
		t.Fatal("WABA ownership crossed tenants")
	}
	if e := first.Store.Put(ctx, p, "connections", "second-phone", another, true); e != nil {
		t.Fatal("same-tenant WABA sharing rejected", e)
	}
}

func TestCORSPreflightAllowsTheActualViteLoopbackOrigin(t *testing.T) {
	_, h, _, _ := fixture(t)
	req, _ := http.NewRequest("OPTIONS", h.URL+"/v1/me", nil)
	req.Header.Set("Origin", "http://127.0.0.1:5173")
	req.Header.Set("Access-Control-Request-Method", "GET")
	req.Header.Set("Access-Control-Request-Headers", "x-api-key,x-tenant-id")
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	if res.StatusCode != 204 || res.Header.Get("Access-Control-Allow-Origin") != "http://127.0.0.1:5173" {
		t.Fatal("Vite preflight blocked")
	}
}

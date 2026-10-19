package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
	"wapo.local/server/internal/store"
)

func TestTemplatesResolveOwnedWABAAndExposeSafePagination(t *testing.T) {
	server, h, p, key := fixture(t)
	ctx := context.Background()
	customer := store.ID("cus")
	connection := store.ID("con")
	if e := server.Store.Put(ctx, p, "customers", customer, store.Object{"id": customer, "name": "Merchant"}, true); e != nil {
		t.Fatal(e)
	}
	c := store.Object{"id": connection, "name": "WhatsApp", "channel": "whatsapp", "customer_id": customer, "business_account_id": "12345", "access_token": server.Store.Seal("provider-token", p), "status": "connected"}
	if e := server.Store.Put(ctx, p, "connections", connection, c, true); e != nil {
		t.Fatal(e)
	}
	calls := 0
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.Path != "/v24.0/12345/message_templates" || r.Header.Get("Authorization") != "Bearer provider-token" {
			t.Error("wrong account or credentials")
		}
		if r.URL.Query().Has("access_token") {
			t.Error("query token leaked")
		}
		if r.Method == "POST" {
			raw, _ := io.ReadAll(r.Body)
			var input store.Object
			if json.Unmarshal(raw, &input) != nil || str(input, "name") != "order_update" || input["access_token"] != nil {
				t.Error("invalid template payload")
			}
			write(w, 200, store.Object{"id": "template1", "status": "PENDING", "category": "UTILITY"})
			return
		}
		write(w, 200, store.Object{"data": []any{store.Object{"id": "template1", "name": "order_update", "language": "es", "category": "UTILITY", "status": "APPROVED", "components": []any{store.Object{"type": "BODY", "text": "Hola"}}}}, "paging": store.Object{"cursors": store.Object{"after": "page2"}, "next": "https://graph.facebook.com/templates?access_token=do-not-expose"}})
	}))
	defer meta.Close()
	server.Meta.BaseURL = meta.URL
	server.Config.MetaVersion = "v24.0"
	status, o := request(t, h.URL, key, "GET", "/v1/connections/"+connection+"/templates", nil, "")
	expect(t, status, 200, o)
	if str(object(o, "meta"), "after") != "page2" || o["paging"] != nil {
		t.Fatal("unsafe pagination")
	}
	status, o = request(t, h.URL, key, "GET", "/v1/customers/"+customer+"/templates?connection_id="+connection, nil, "")
	expect(t, status, 200, o)
	status, o = request(t, h.URL, key, "POST", "/v1/connections/"+connection+"/templates", store.Object{"name": "order_update", "language": "es", "category": "UTILITY", "components": []any{store.Object{"type": "BODY", "text": "Hola"}}, "access_token": "attacker-value"}, "")
	expect(t, status, 201, o)
	before := calls
	other := store.ID("customer")
	server.Store.Put(ctx, p, "customers", other, store.Object{"id": other, "name": "Other"}, true)
	status, o = request(t, h.URL, key, "GET", "/v1/customers/"+other+"/templates?connection_id="+connection, nil, "")
	expect(t, status, 404, o)
	status, o = request(t, h.URL, key, "GET", "/v1/connections/foreign/templates", nil, "")
	expect(t, status, 404, o)
	status, o = request(t, h.URL, key, "GET", "/v1/customers/"+customer+"/templates", nil, "")
	expect(t, status, 422, o)
	if calls != before {
		t.Fatal("unowned resource reached Meta")
	}
	status, o = request(t, h.URL, key, "POST", "/v1/connections/"+connection+"/templates", store.Object{"name": "BAD NAME", "language": "es", "category": "UTILITY", "components": []any{store.Object{}}}, "")
	expect(t, status, 422, o)
}

func TestTemplatesRefreshExpiringCredentialBeforeCallingMeta(t *testing.T) {
	server, h, project, key := fixture(t)
	ctx := context.Background()
	connection := store.ID("con")
	account := "9876501"
	if e := server.Store.Put(ctx, project, "connections", connection, store.Object{"id": connection, "channel": "whatsapp", "business_account_id": account, "access_token": server.Store.Seal("expiring-token", project), "status": "connected"}, true); e != nil {
		t.Fatal(e)
	}
	server.Config.MetaAppID = "meta-app"
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v24.0/debug_token":
			if r.Header.Get("Authorization") != "Bearer meta-app|meta-test-secret" || r.URL.Query().Get("input_token") != "expiring-token" {
				t.Error("token inspection was not app-authenticated")
			}
			write(w, 200, store.Object{"data": store.Object{"is_valid": true, "app_id": "meta-app", "expires_at": time.Now().Add(time.Hour).Unix()}})
		case "/v24.0/oauth/access_token":
			if r.URL.Query().Get("grant_type") != "fb_exchange_token" || r.URL.Query().Get("set_token_expires_in_60_days") != "true" || r.URL.Query().Get("fb_exchange_token") != "expiring-token" {
				t.Error("invalid automatic refresh request")
			}
			write(w, 200, store.Object{"access_token": "renewed-token", "expires_in": 60 * 24 * 60 * 60})
		case "/v24.0/" + account + "/message_templates":
			if r.Header.Get("Authorization") != "Bearer renewed-token" {
				t.Error("templates request did not use renewed credential")
			}
			write(w, 200, store.Object{"data": []any{}})
		default:
			t.Errorf("unexpected Meta request %s", r.URL.Path)
			write(w, 404, store.Object{})
		}
	}))
	defer meta.Close()
	server.Meta.BaseURL = meta.URL
	server.Meta.Version = "v24.0"
	server.Config.MetaVersion = "v24.0"
	status, body := request(t, h.URL, key, "GET", "/v1/connections/"+connection+"/templates", nil, "")
	expect(t, status, 200, body)
	saved, e := server.Store.Get(ctx, project, "connections", connection)
	if e != nil {
		t.Fatal(e)
	}
	token, e := server.Store.Unseal(str(saved, "access_token"), project)
	if e != nil || token != "renewed-token" || str(saved, "credential_status") != "valid" || str(saved, "access_token_expires_at") == "" {
		t.Fatalf("renewed credential was not persisted safely: token=%q state=%#v error=%v", token, saved, e)
	}
}

func TestTemplatesReturnRecoveryErrorForExpiredCredential(t *testing.T) {
	server, h, project, key := fixture(t)
	ctx := context.Background()
	connection := store.ID("con")
	if e := server.Store.Put(ctx, project, "connections", connection, store.Object{"id": connection, "channel": "whatsapp", "customer_id": "customer", "external_id": "123456789", "business_account_id": "9876502", "access_token": server.Store.Seal("expired-token", project), "status": "connected"}, true); e != nil {
		t.Fatal(e)
	}
	server.Config.MetaAppID = "meta-app"
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v24.0/debug_token" {
			t.Errorf("expired credential reached %s", r.URL.Path)
		}
		write(w, 200, store.Object{"data": store.Object{"is_valid": false, "app_id": "meta-app", "expires_at": time.Now().Add(-time.Hour).Unix()}})
	}))
	defer meta.Close()
	server.Meta.BaseURL = meta.URL
	server.Meta.Version = "v24.0"
	server.Config.MetaVersion = "v24.0"
	status, body := request(t, h.URL, key, "GET", "/v1/connections/"+connection+"/templates", nil, "")
	expect(t, status, 409, body)
	if str(object(body, "error"), "code") != "credential_expired" {
		t.Fatalf("unexpected credential error: %#v", body)
	}
	saved, e := server.Store.Get(ctx, project, "connections", connection)
	if e != nil || str(saved, "credential_status") != "expired" {
		t.Fatalf("expired credential state was not persisted: %#v %v", saved, e)
	}
}

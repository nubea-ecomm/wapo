package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func TestHostedOnboardingDedicatedAndCoexistence(t *testing.T) {
	server, h, p, key := fixture(t)
	server.Config.MetaAppID = "meta-app"
	server.Config.MetaConfigID = "meta-config"
	server.Config.MetaVersion = "v24.0"
	server.Config.PublicURL = h.URL
	var mu sync.Mutex
	calls := []string{}
	activeLinkID := ""
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		calls = append(calls, r.Method+" "+r.URL.Path)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/oauth/access_token"):
			if activeLinkID != "" {
				checkCtx, checkCancel := context.WithTimeout(context.Background(), time.Second)
				defer checkCancel()
				var status string
				if e := server.Store.Pool.QueryRow(checkCtx, "SELECT data->>'status' FROM resources WHERE project_id=$1 AND kind='setup_links' AND id=$2", p, activeLinkID).Scan(&status); e != nil || status != "processing" {
					t.Errorf("setup claim held a database transaction during provider call: status=%s error=%v", status, e)
				}
			}
			if r.URL.Query().Get("client_secret") != "meta-test-secret" {
				t.Error("missing server-side app secret")
			}
			write(w, 200, store.Object{"access_token": "provider-token-" + r.URL.Query().Get("code")})
		case strings.HasSuffix(r.URL.Path, "/phone_numbers"):
			coex := strings.Contains(r.Header.Get("Authorization"), "coex")
			id := "111111"
			if !coex {
				id = "222222"
			}
			write(w, 200, store.Object{"data": []any{store.Object{"id": id, "display_phone_number": "+123456789", "is_on_biz_app": coex, "quality_rating": "GREEN"}}})
		case strings.HasSuffix(r.URL.Path, "/subscribed_apps"):
			raw, _ := io.ReadAll(r.Body)
			var o store.Object
			json.Unmarshal(raw, &o)
			if str(o, "override_callback_uri") != h.URL+"/hooks/meta/"+p {
				t.Error("wrong tenant webhook override")
			}
			write(w, 200, store.Object{"success": true})
		case strings.HasSuffix(r.URL.Path, "/register"), strings.HasSuffix(r.URL.Path, "/smb_app_data"):
			write(w, 200, store.Object{"success": true})
		default:
			t.Errorf("unexpected Meta operation %s", r.URL.Path)
			write(w, 404, store.Object{})
		}
	}))
	defer meta.Close()
	server.Meta.BaseURL = meta.URL
	status, o := request(t, h.URL, key, "POST", "/v1/customers", store.Object{"name": "Merchant", "external_customer_id": "shop-1", "metadata": store.Object{"plan": "pro"}}, "")
	expect(t, status, 201, o)
	customer := str(object(o, "data"), "id")
	for _, mode := range []string{"coexistence", "dedicated"} {
		status, o = request(t, h.URL, key, "POST", "/platform/v1/customers/"+customer+"/setup_links", store.Object{"setup_link": store.Object{"allowed_connection_types": []string{mode}, "success_redirect_url": "https://client.example/dashboard?setup=complete"}}, "")
		expect(t, status, 201, o)
		link := object(o, "data")
		token := str(link, "token")
		linkID := str(link, "id")
		activeLinkID = linkID
		if !strings.HasPrefix(str(link, "url"), h.URL+"/setup/"+p) {
			t.Fatal("wrong hosted URL")
		}
		persisted, e := server.Store.Get(context.Background(), p, "setup_links", linkID)
		if e != nil {
			t.Fatal(e)
		}
		if persisted["token"] != nil || persisted["url"] != nil {
			t.Fatal("plaintext link capability persisted")
		}
		publicPath := "/public/setup/" + p + "/" + token
		status, o = request(t, h.URL, "", "GET", publicPath, nil, "")
		expect(t, status, 200, o)
		if object(o, "data")["access_token"] != nil || object(o, "data")["client_secret"] != nil {
			t.Fatal("browser received credentials")
		}
		code := "dedicated-code"
		if mode == "coexistence" {
			code = "coex-code"
		}
		// No phone ID in the browser payload: discovery must work for Coexistence's completion event.
		status, o = request(t, h.URL, "", "POST", publicPath+"/complete", store.Object{"code": code, "waba_id": "654321", "connection_type": mode}, "")
		expect(t, status, 200, o)
		connection := object(object(o, "data"), "connection")
		if str(connection, "connection_type") != mode || str(connection, "status") != "connected" {
			t.Fatal(o)
		}
		if connection["access_token"] != nil || connection["registration_pin"] != nil {
			t.Fatal("credential leaked")
		}
		redirect, e := url.Parse(str(object(o, "data"), "redirect_url"))
		if e != nil || redirect.Query().Get("business_account_id") != "654321" || redirect.Query().Get("phone_number_id") == "" {
			t.Fatal("compatibility redirect parameters missing")
		}
		status, o = request(t, h.URL, "", "POST", publicPath+"/complete", store.Object{"code": code, "waba_id": "654321", "connection_type": mode}, "")
		expect(t, status, 410, o)
		// Renewing credentials preserves IDs and never repeats registration/history sync.
		status, o = request(t, h.URL, key, "POST", "/v1/customers/"+customer+"/setup_links", store.Object{"reconnect_phone_number": connection["external_id"]}, "")
		expect(t, status, 201, o)
		renewal := object(o, "data")
		activeLinkID = str(renewal, "id")
		status, o = request(t, h.URL, "", "POST", "/public/setup/"+p+"/"+str(renewal, "token")+"/complete", store.Object{"code": code, "waba_id": "654321", "connection_type": mode}, "")
		expect(t, status, 200, o)
		if str(object(object(o, "data"), "connection"), "id") != str(connection, "id") {
			t.Fatal("renewal replaced connection identity")
		}
	}
	mu.Lock()
	defer mu.Unlock()
	var register, syncCount int
	for _, call := range calls {
		if strings.Contains(call, "/register") {
			register++
			if !strings.Contains(call, "222222") {
				t.Fatal("Coexistence number was registered as dedicated")
			}
		}
		if strings.Contains(call, "/smb_app_data") {
			syncCount++
		}
	}
	if register != 1 || syncCount != 2 {
		t.Fatalf("register=%d sync=%d", register, syncCount)
	}
	status, o = request(t, h.URL, key, "PATCH", "/v1/customers/"+customer, store.Object{"name": "Updated Merchant"}, "")
	expect(t, status, 200, o)
	status, o = request(t, h.URL, key, "POST", "/v1/customers/"+customer+"/setup_links", store.Object{"provision_phone_number": true}, "")
	expect(t, status, 501, o)
}
func TestSetupLinksExpiryRevocationAndIsolation(t *testing.T) {
	server, h, p, key := fixture(t)
	server.Config.MetaAppID = "app"
	server.Config.MetaConfigID = "config"
	server.Config.PublicURL = h.URL
	status, o := request(t, h.URL, key, "POST", "/v1/customers", store.Object{"name": "Merchant"}, "")
	expect(t, status, 201, o)
	customer := str(object(o, "data"), "id")
	status, o = request(t, h.URL, key, "POST", "/v1/customers/"+customer+"/setup_links", store.Object{}, "")
	expect(t, status, 201, o)
	link := object(o, "data")
	status, o = request(t, h.URL, key, "DELETE", "/v1/setup_links/"+str(link, "id"), nil, "")
	expect(t, status, 200, o)
	status, o = request(t, h.URL, "", "GET", "/public/setup/"+p+"/"+str(link, "token"), nil, "")
	expect(t, status, 410, o)
	status, o = request(t, h.URL, key, "POST", "/v1/customers/"+customer+"/setup_links", store.Object{}, "")
	expect(t, status, 201, o)
	link = object(o, "data")
	saved, _ := server.Store.Get(context.Background(), p, "setup_links", str(link, "id"))
	saved["expires_at"] = time.Now().Add(-time.Hour).Format(time.RFC3339Nano)
	server.Store.Put(context.Background(), p, "setup_links", str(link, "id"), saved, false)
	status, o = request(t, h.URL, "", "GET", "/public/setup/"+p+"/"+str(link, "token"), nil, "")
	expect(t, status, 410, o)
	_, _, _, otherKey := fixture(t)
	status, o = request(t, h.URL, otherKey, "GET", "/v1/customers/"+customer+"/setup_links", nil, "")
	expect(t, status, 404, o)
}

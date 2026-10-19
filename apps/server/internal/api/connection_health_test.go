package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func TestConnectionHealthReportsBillingAndMissingAccessWithoutInventingSuccess(t *testing.T) {
	s, h, p, key := fixture(t)
	s.Config.MetaAppID = "app1"
	s.Config.MetaVersion = "v24.0"
	ctx := context.Background()
	c := store.Object{"id": "health-con", "channel": "whatsapp", "external_id": "123456", "business_account_id": "health-account", "access_token": s.Store.Seal("health-secret", p), "status": "connected"}

	if e := s.Store.Put(ctx, p, "connections", "health-con", c, true); e != nil {
		t.Fatal(e)
	}

	calls := 0

	var failed atomic.Bool

	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++

		if failed.Load() {
			write(w, 400, store.Object{"error": store.Object{"code": 190, "message": "Expired health-secret"}})
			return
		}

		if r.URL.Path == "/v24.0/debug_token" {
			if r.Header.Get("Authorization") != "Bearer app1|meta-test-secret" {
				t.Error("wrong app token")
			}

			write(w, 200, store.Object{"data": store.Object{"is_valid": true, "app_id": "app1", "scopes": []string{"whatsapp_business_management", "whatsapp_business_messaging"}}})

			return
		}

		if r.Header.Get("Authorization") != "Bearer health-secret" {
			t.Error("wrong stored token")
		}

		switch {
		case r.URL.Query().Get("fields") == "health_status":
			write(w, 200, store.Object{"health_status": store.Object{"can_send_message": "BLOCKED", "entities": []any{store.Object{"entity_type": "WABA", "errors": []any{store.Object{"error_code": 141006, "error_description": "Payment method needs attention", "possible_solution": "Update the payment method in Meta"}}}}}})
		case r.URL.Path == "/v24.0/health-account/subscribed_apps":
			write(w, 200, store.Object{"data": []any{store.Object{"whatsapp_business_api_data": store.Object{"id": "app1"}}}})
		case r.URL.Path == "/v24.0/health-account":
			write(w, 200, store.Object{"id": "health-account", "account_review_status": "APPROVED"})
		default:
			write(w, 200, store.Object{"id": "123456", "quality_rating": "GREEN"})
		}
	}))

	defer meta.Close()

	s.Meta.BaseURL = meta.URL
	status, body := request(t, h.URL, key, "GET", "/v1/connections/health-con/health", nil, "")
	expect(t, status, 200, body)
	d := object(body, "data")
	if str(d, "status") != "error" || str(object(d, "billing"), "status") != "attention_required" {
		t.Fatal(d)
	}

	checks := d["checks"].([]any)
	foundUnknownVerification := false

	for _, item := range checks {
		o := item.(map[string]any)
		if str(o, "id") == "webhook_verification" && str(o, "status") == "unknown" {
			foundUnknownVerification = true
		}
	}

	if !foundUnknownVerification {
		t.Fatal("unverified webhook reported as verified")
	}

	before := calls
	status, body = request(t, h.URL, key, "GET", "/v1/connections/health-con/health", nil, "")
	expect(t, status, 200, body)

	if calls != before {
		t.Fatal("GET bypassed cache")
	}

	status, body = request(t, h.URL, key, "POST", "/v1/connections/health-con/health", nil, "")
	expect(t, status, 429, body)
	_, _, _, foreign := fixture(t)
	status, body = request(t, h.URL, foreign, "GET", "/v1/connections/health-con/health", nil, "")
	expect(t, status, 404, body)

	saved, _ := s.Store.Get(ctx, p, "connection_health", "health-con")
	saved["checked_at"] = time.Now().Add(-time.Minute).UTC().Format(time.RFC3339Nano)
	s.Store.Put(ctx, p, "connection_health", "health-con", saved, false)
	failed.Store(true)

	status, body = request(t, h.URL, key, "POST", "/v1/connections/health-con/health", nil, "")
	expect(t, status, 200, body)
	d = object(body, "data")
	raw, _ := json.Marshal(body)

	if strings.Contains(string(raw), "health-secret") || strings.Contains(string(raw), "meta-test-secret") {
		t.Fatal("provider credentials leaked into diagnostics")
	}

	if str(d, "status") != "error" || str(object(d, "billing"), "status") != "unknown" {
		t.Fatal("missing access should not infer a billing failure")
	}
}

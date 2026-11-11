package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"wapo.local/server/internal/config"
	"wapo.local/server/internal/store"
)

func TestAuthorizedWABAsUseGranularScopes(t *testing.T) {
	var response store.Object

	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v24.0/debug_token" || r.URL.Query().Get("input_token") != "signup-token" {
			t.Errorf("unexpected inspection %s?%s", r.URL.Path, r.URL.RawQuery)
		}

		if r.Header.Get("Authorization") != "Bearer app|secret" {
			t.Errorf("inspection must use the app token, got %q", r.Header.Get("Authorization"))
		}

		write(w, 200, response)
	}))

	defer meta.Close()

	s := New(nil, config.Config{MetaAppID: "app", MetaAppSecret: "secret", MetaVersion: "v24.0"})
	s.Meta.BaseURL = meta.URL
	scopes := func(management ...any) store.Object {
		return store.Object{"data": store.Object{"app_id": "app", "granular_scopes": []any{
			store.Object{"scope": "whatsapp_business_messaging", "target_ids": []any{"999"}},
			store.Object{"scope": "whatsapp_business_management", "target_ids": management},
		}}}
	}

	response = scopes("654321", "654321", "777")

	got, e := s.authorizedWABAs(context.Background(), "signup-token")
	if e != nil || strings.Join(got, ",") != "654321,777" {
		t.Fatalf("authorizedWABAs = %v, %v", got, e)
	}

	for name, body := range map[string]store.Object{
		"none":      scopes(),
		"other app": {"data": store.Object{"app_id": "other", "granular_scopes": []any{store.Object{"scope": "whatsapp_business_management", "target_ids": []any{"654321"}}}}},
	} {
		response = body

		if got, e := s.authorizedWABAs(context.Background(), "signup-token"); e == nil {
			t.Errorf("%s: expected an error, got %v", name, got)
		}
	}
}

func TestResolveSetupPhoneAcrossSeveralWABAs(t *testing.T) {
	phones := map[string][]any{}

	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/debug_token") {
			write(w, 200, store.Object{"data": store.Object{"app_id": "app", "granular_scopes": []any{store.Object{"scope": "whatsapp_business_management", "target_ids": []any{"111", "222"}}}}})
			return
		}

		account := strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/v24.0/"), "/phone_numbers")
		write(w, 200, store.Object{"data": phones[account]})
	}))

	defer meta.Close()

	s := New(nil, config.Config{MetaAppID: "app", MetaAppSecret: "secret", MetaVersion: "v24.0"})
	s.Meta.BaseURL = meta.URL
	ctx := context.Background()
	phones["111"] = []any{store.Object{"id": "p-dedicated", "is_on_biz_app": false}}
	phones["222"] = []any{store.Object{"id": "p-app", "is_on_biz_app": true}}

	waba, phone, code, _ := s.resolveSetupPhone(ctx, "token", "", "", "coexistence")
	if code != "" || waba != "222" || str(phone, "id") != "p-app" {
		t.Fatalf("coexistence picked %s/%v code=%s", waba, phone, code)
	}

	waba, phone, code, _ = s.resolveSetupPhone(ctx, "token", "", "p-dedicated", "coexistence")
	if code != "" || waba != "111" || str(phone, "id") != "p-dedicated" {
		t.Fatalf("explicit phone picked %s/%v code=%s", waba, phone, code)
	}

	phones["111"] = []any{store.Object{"id": "p-app-2", "is_on_biz_app": true}}

	if _, _, code, _ = s.resolveSetupPhone(ctx, "token", "", "", "coexistence"); code != "ambiguous_phone_number" {
		t.Fatalf("two app phones must be ambiguous, got %q", code)
	}

	// A provided WABA is used as is, without token inspection.
	waba, phone, code, _ = s.resolveSetupPhone(ctx, "token", "222", "", "dedicated")
	if code != "" || waba != "222" || str(phone, "id") != "p-app" {
		t.Fatalf("provided WABA picked %s/%v code=%s", waba, phone, code)
	}
}

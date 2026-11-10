package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"wapo.local/server/internal/config"
	"wapo.local/server/internal/store"
)

func TestAuthorizedWABAUsesGranularScopes(t *testing.T) {
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

	response = scopes("654321", "654321")

	if got, e := s.authorizedWABA(context.Background(), "signup-token"); e != nil || got != "654321" {
		t.Fatalf("authorizedWABA = %q, %v", got, e)
	}

	for name, body := range map[string]store.Object{
		"none":      scopes(),
		"ambiguous": scopes("111", "222"),
		"other app": {"data": store.Object{"app_id": "other", "granular_scopes": []any{store.Object{"scope": "whatsapp_business_management", "target_ids": []any{"654321"}}}}},
	} {
		response = body

		if got, e := s.authorizedWABA(context.Background(), "signup-token"); e == nil {
			t.Errorf("%s: expected an error, got %q", name, got)
		}
	}
}

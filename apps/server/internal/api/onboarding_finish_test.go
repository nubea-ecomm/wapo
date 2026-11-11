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

func TestCoexistenceSyncRefusalKeepsTheConnection(t *testing.T) {
	refuse := true

	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/smb_app_data") && refuse {
			write(w, 400, store.Object{"error": store.Object{"message": "sync window closed"}})
			return
		}

		write(w, 200, store.Object{"success": true})
	}))

	defer meta.Close()

	s := New(nil, config.Config{MetaVersion: "v24.0", PublicURL: "https://api.example.com"})
	s.Meta.BaseURL = meta.URL
	c := store.Object{"id": "con", "business_account_id": "111", "external_id": "222"}

	if e := s.finishOnboarding(context.Background(), "project", c, "token", "coexistence"); e != nil {
		t.Fatalf("a refused sync must not fail the connection: %v", e)
	}

	if c["history_sync_requested"] != false || c["contacts_sync_requested"] != false || str(c, "sync_error") == "" {
		t.Fatalf("refusal not recorded: %v", c)
	}

	refuse = false

	if e := s.finishOnboarding(context.Background(), "project", c, "token", "coexistence"); e != nil || c["sync_error"] != nil || c["history_sync_requested"] != true {
		t.Fatalf("successful sync must clear the error: %v %v", e, c)
	}
}

func TestSubscriptionFailureStillFailsOnboarding(t *testing.T) {
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		write(w, 500, store.Object{})
	}))

	defer meta.Close()

	s := New(nil, config.Config{MetaVersion: "v24.0", PublicURL: "https://api.example.com"})
	s.Meta.BaseURL = meta.URL

	if e := s.finishOnboarding(context.Background(), "project", store.Object{"id": "con", "business_account_id": "111", "external_id": "222"}, "token", "coexistence"); e == nil {
		t.Fatal("subscription failure must fail onboarding")
	}
}

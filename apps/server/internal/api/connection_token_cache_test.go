package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"wapo.local/server/internal/config"
	"wapo.local/server/internal/store"
)

func TestTokenInspectionCacheCoalescesAndIsolatesCredentials(t *testing.T) {
	var calls atomic.Int32

	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		write(w, 200, store.Object{"data": store.Object{"is_valid": true, "app_id": "app", "scopes": []string{"whatsapp_business_management", "whatsapp_business_messaging"}}})
	}))
	defer meta.Close()

	s := New(nil, config.Config{MetaAppID: "app", MetaAppSecret: "secret", MetaVersion: "v24.0"})
	s.Meta.BaseURL = meta.URL
	ctx := context.Background()

	var group sync.WaitGroup

	for range 30 {
		group.Go(func() {
			data, err := s.inspectConnectionToken(ctx, "project", "token")
			if err != nil || str(object(data, "data"), "app_id") != "app" {
				t.Errorf("inspection failed: %v", err)
			}
		})
	}

	group.Wait()

	if calls.Load() != 1 {
		t.Fatalf("concurrent requests made %d inspections", calls.Load())
	}

	// Permissions and renewal share the exact same cached inspection.
	data, err := s.inspectConnectionToken(ctx, "project", "token")
	s.checkConnectionToken(data, err, func(_, _, status, _ string, _ store.Object) {
		if status != "pass" {
			t.Errorf("permission check failed: %s", status)
		}
	})

	if calls.Load() != 1 {
		t.Fatal("permission check repeated token inspection")
	}

	for _, pair := range [][2]string{{"other-project", "token"}, {"project", "other-token"}} {
		if _, err := s.inspectConnectionToken(ctx, pair[0], pair[1]); err != nil {
			t.Fatal(err)
		}
	}

	if calls.Load() != 3 {
		t.Fatal("cache crossed project or token boundaries")
	}

	s.invalidateTokenInspection("project", "token")

	if _, err := s.inspectConnectionToken(ctx, "project", "token"); err != nil {
		t.Fatal(err)
	}

	if calls.Load() != 4 {
		t.Fatal("invalidated inspection was reused")
	}

	s.tokenChecks.mu.Lock()
	s.tokenChecks.entries[s.tokenInspectionKey("project", "token")].expires = time.Now().Add(-time.Second)
	s.tokenChecks.mu.Unlock()

	if _, err := s.inspectConnectionToken(ctx, "project", "token"); err != nil {
		t.Fatal(err)
	}

	if calls.Load() != 5 {
		t.Fatal("expired cache entry was reused")
	}
}

func TestTokenInspectionCacheDoesNotCacheFailures(t *testing.T) {
	for _, scenario := range []string{"unavailable", "malformed", "invalid", "wrong-app", "expired"} {
		t.Run(scenario, func(t *testing.T) {
			var calls atomic.Int32

			meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)

				switch scenario {
				case "unavailable":
					write(w, 429, store.Object{})
				case "malformed":
					w.Write([]byte("not json"))
				case "invalid":
					write(w, 200, store.Object{"data": store.Object{"is_valid": false, "app_id": "app"}})
				case "wrong-app":
					write(w, 200, store.Object{"data": store.Object{"is_valid": true, "app_id": "other"}})
				case "expired":
					write(w, 200, store.Object{"data": store.Object{"is_valid": true, "app_id": "app", "expires_at": time.Now().Add(-time.Minute).Unix()}})
				}
			}))
			defer meta.Close()

			s := New(nil, config.Config{MetaAppID: "app", MetaAppSecret: "secret", MetaVersion: "v24.0"})
			s.Meta.BaseURL = meta.URL

			for range 2 {
				s.inspectConnectionToken(context.Background(), "project", "token")
			}

			if calls.Load() != 2 || len(s.tokenChecks.entries) != 0 {
				t.Fatal("failed inspection was cached")
			}
		})
	}
}

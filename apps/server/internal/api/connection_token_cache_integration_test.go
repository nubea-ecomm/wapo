package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"wapo.local/server/internal/store"
)

func TestTemplatesReuseInspectionAndInvalidateOnProviderExpiry(t *testing.T) {
	s, h, project, key := fixture(t)
	s.Config.MetaAppID = "app"
	s.Config.MetaVersion = "v24.0"
	s.Meta.Version = "v24.0"
	connection := store.ID("con")

	if err := s.Store.Put(context.Background(), project, "connections", connection, store.Object{
		"id": connection, "channel": "whatsapp", "business_account_id": "12345",
		"access_token": s.Store.Seal("token", project), "status": "connected",
	}, true); err != nil {
		t.Fatal(err)
	}

	var (
		expired                atomic.Bool
		inspections, templates atomic.Int32
	)

	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v24.0/debug_token":
			inspections.Add(1)
			write(w, 200, store.Object{"data": store.Object{"is_valid": !expired.Load(), "app_id": "app"}})
		case "/v24.0/12345/message_templates":
			templates.Add(1)

			if expired.Load() {
				write(w, 400, store.Object{"error": store.Object{"code": 190}})
			} else {
				write(w, 200, store.Object{"data": []any{}})
			}
		default:
			t.Errorf("unexpected Meta request: %s", r.URL.Path)
			write(w, 404, store.Object{})
		}
	}))
	defer meta.Close()

	s.Meta.BaseURL = meta.URL
	path := "/v1/connections/" + connection + "/templates"

	for range 3 {
		status, body := request(t, h.URL, key, "GET", path, nil, "")
		expect(t, status, 200, body)
	}

	if inspections.Load() != 1 || templates.Load() != 3 {
		t.Fatalf("repeated template reads made %d inspections, %d template requests", inspections.Load(), templates.Load())
	}

	expired.Store(true)

	status, body := request(t, h.URL, key, "GET", path, nil, "")
	expect(t, status, 409, body)
	status, body = request(t, h.URL, key, "GET", path, nil, "")
	expect(t, status, 409, body)

	if inspections.Load() != 2 || templates.Load() != 4 {
		t.Fatal("provider expiry did not invalidate cached inspection before the next operation")
	}
}

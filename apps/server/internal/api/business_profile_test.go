package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"wapo.local/server/internal/store"
)

func TestBusinessProfileReadUpdateValidationAndIsolation(t *testing.T) {
	server, httpServer, project, key := fixture(t)
	server.Config.MetaVersion = "v24.0"
	ctx := context.Background()
	connectionID := store.ID("profile-connection")
	connection := store.Object{"id": connectionID, "channel": "whatsapp", "external_id": "123456789", "business_account_id": "987654321", "access_token": server.Store.Seal("profile-token", project), "status": "connected"}

	if err := server.Store.Put(ctx, project, "connections", connectionID, connection, true); err != nil {
		t.Fatal(err)
	}

	profile := store.Object{"about": "Original", "address": "Main Street", "description": "Original description", "email": "hello@example.com", "profile_picture_url": "https://images.example.com/profile.jpg", "websites": []any{"https://example.com"}, "vertical": "RETAIL"}
	posts := 0
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer profile-token" || r.URL.Path != "/v24.0/123456789/whatsapp_business_profile" {
			t.Fatalf("unexpected Meta request: %s %s %#v", r.Method, r.URL.Path, r.Header)
		}

		if r.Method == http.MethodPost {
			posts++

			var payload store.Object

			if json.NewDecoder(r.Body).Decode(&payload) != nil || payload["messaging_product"] != "whatsapp" || payload["about"] != "Updated profile" {
				t.Fatalf("unexpected update payload: %#v", payload)
			}

			profile["about"] = payload["about"]

			write(w, 200, store.Object{"success": true})

			return
		}

		if r.URL.Query().Get("fields") == "" {
			t.Fatal("profile fields were not requested")
		}

		write(w, 200, store.Object{"data": []any{profile}})
	}))

	defer meta.Close()

	server.Meta.BaseURL = meta.URL

	status, body := request(t, httpServer.URL, key, "GET", "/v1/connections/"+connectionID+"/business-profile", nil, "")
	expect(t, status, 200, body)

	if str(object(body, "data"), "about") != "Original" {
		t.Fatalf("unexpected profile: %#v", body)
	}

	status, body = request(t, httpServer.URL, key, "PATCH", "/v1/connections/"+connectionID+"/business-profile", store.Object{"about": "Updated profile", "email": "support@example.com", "vertical": "PROF_SERVICES", "websites": []string{"https://example.com", "https://status.example.com"}}, "")
	expect(t, status, 200, body)

	if posts != 1 || str(object(body, "data"), "about") != "Updated profile" {
		t.Fatalf("profile was not updated: posts=%d body=%#v", posts, body)
	}

	status, body = request(t, httpServer.URL, key, "PATCH", "/v1/connections/"+connectionID+"/business-profile", store.Object{"websites": []string{"javascript:alert(1)"}}, "")
	expect(t, status, 422, body)

	if posts != 1 {
		t.Fatal("invalid profile reached Meta")
	}

	_, otherHTTP, _, otherKey := fixture(t)
	status, body = request(t, otherHTTP.URL, otherKey, "GET", "/v1/connections/"+connectionID+"/business-profile", nil, "")
	expect(t, status, 404, body)
}

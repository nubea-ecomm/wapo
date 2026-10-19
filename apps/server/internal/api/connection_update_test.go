package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"wapo.local/server/internal/store"
)

func TestConnectionUpdateRotatesVerifiedCredentialAndName(t *testing.T) {
	server, h, project, key := fixture(t)
	ctx := context.Background()
	connection := store.ID("con")
	phone := "880001"
	account := "880000"
	current := store.Object{"id": connection, "name": "Old name", "channel": "whatsapp", "external_id": phone, "business_account_id": account, "access_token": server.Store.Seal("old-token", project), "status": "connected", "credential_status": "expired", "access_token_expires_at": "2026-01-01T00:00:00Z"}

	if err := server.Store.Put(ctx, project, "connections", connection, current, true); err != nil {
		t.Fatal(err)
	}

	if err := server.Store.Put(ctx, project, "connection_health", connection, store.Object{"id": connection, "status": "error"}, true); err != nil {
		t.Fatal(err)
	}

	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer replacement-token" {
			t.Error("replacement credential was not used")
		}

		switch r.URL.Path {
		case "/v24.0/" + phone:
			write(w, 200, store.Object{"id": phone, "display_phone_number": "+54 11 5555 0000", "quality_rating": "GREEN", "is_on_biz_app": false})
		case "/v24.0/" + account + "/phone_numbers":
			write(w, 200, store.Object{"data": []any{store.Object{"id": phone}}})
		default:
			t.Errorf("unexpected Meta request %s", r.URL.Path)
			write(w, 404, store.Object{})
		}
	}))

	defer meta.Close()

	server.Meta.BaseURL = meta.URL
	server.Config.MetaVersion = "v24.0"
	status, body := request(t, h.URL, key, "PATCH", "/v1/connections/"+connection, store.Object{"name": "Support number", "access_token": "replacement-token"}, "")
	expect(t, status, 200, body)
	output := object(body, "data")
	if str(output, "name") != "Support number" || str(output, "credential_status") != "valid" || output["access_token"] != nil {
		t.Fatalf("unsafe or incorrect update response: %#v", output)
	}

	saved, err := server.Store.Get(ctx, project, "connections", connection)
	if err != nil {
		t.Fatal(err)
	}

	token, err := server.Store.Unseal(str(saved, "access_token"), project)
	if err != nil || token != "replacement-token" || saved["access_token_expires_at"] != nil {
		t.Fatalf("credential was not rotated safely: token=%q state=%#v error=%v", token, saved, err)
	}

	if _, err = server.Store.Get(ctx, project, "connection_health", connection); err != store.ErrNotFound {
		t.Fatalf("stale health cache survived credential rotation: %v", err)
	}
}

func TestConnectionUpdateNameDoesNotRequireProvider(t *testing.T) {
	server, h, project, key := fixture(t)
	ctx := context.Background()
	connection := store.ID("con")
	current := store.Object{"id": connection, "name": "Old", "channel": "whatsapp", "external_id": "990001", "business_account_id": "990000", "access_token": server.Store.Seal("unchanged", project), "status": "connected"}

	if err := server.Store.Put(ctx, project, "connections", connection, current, true); err != nil {
		t.Fatal(err)
	}

	if err := server.Store.Put(ctx, project, "connection_health", connection, store.Object{"id": connection, "status": "healthy"}, true); err != nil {
		t.Fatal(err)
	}

	status, body := request(t, h.URL, key, "PATCH", "/v1/connections/"+connection, store.Object{"name": "New name"}, "")
	expect(t, status, 200, body)

	saved, err := server.Store.Get(ctx, project, "connections", connection)
	if err != nil {
		t.Fatal(err)
	}

	token, _ := server.Store.Unseal(str(saved, "access_token"), project)
	if str(saved, "name") != "New name" || token != "unchanged" {
		t.Fatalf("name-only update changed credential: %#v", saved)
	}

	if _, err = server.Store.Get(ctx, project, "connection_health", connection); err != nil {
		t.Fatalf("name-only update removed health cache: %v", err)
	}
}

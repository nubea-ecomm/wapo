package api

import (
	"context"
	"testing"

	"wapo.local/server/internal/store"
)

func TestConsoleUserLoginSessionAndManagedAPIKeys(t *testing.T) {
	server, h, _, _ := fixture(t)
	ctx := context.Background()
	email := store.ID("admin") + "@example.com"
	password := "local-test-password-123"

	user, e := server.Store.CreateUser(ctx, email, "Test administrator", password)
	if e != nil {
		t.Fatal(e)
	}

	t.Cleanup(func() { server.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE id=$1", user.ID) })
	status, o := request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "incorrect"}, "")
	expect(t, status, 401, o)
	status, o = request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": password}, "")
	expect(t, status, 200, o)
	token := str(object(o, "data"), "token")
	if token == "" {
		t.Fatal("session missing")
	}

	status, o = request(t, h.URL, token, "GET", "/admin/v1/tenants", nil, "")
	expect(t, status, 200, o)
	status, o = request(t, h.URL, token, "GET", "/admin/v1/users", nil, "")
	expect(t, status, 200, o)

	for _, value := range o["data"].([]any) {
		row := value.(map[string]any)
		if row["password_hash"] != nil || row["password"] != nil {
			t.Fatal("password leaked")
		}
	}

	status, o = request(t, h.URL, token, "PATCH", "/admin/v1/users/"+user.ID, store.Object{"active": false}, "")
	expect(t, status, 409, o)
	status, o = request(t, h.URL, token, "PATCH", "/admin/v1/users/"+user.ID, store.Object{"password": "new-test-password-123"}, "")
	expect(t, status, 200, o)
	status, o = request(t, h.URL, token, "GET", "/admin/v1/tenants", nil, "")
	expect(t, status, 401, o)
	status, o = request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "new-test-password-123"}, "")
	expect(t, status, 200, o)
	token = str(object(o, "data"), "token")
	status, o = request(t, h.URL, token, "POST", "/auth/v1/logout", nil, "")
	expect(t, status, 200, o)
	status, o = request(t, h.URL, token, "GET", "/admin/v1/tenants", nil, "")
	expect(t, status, 401, o)
}

func TestConsoleUserCanUpdateOwnProfile(t *testing.T) {
	server, h, _, _ := fixture(t)
	ctx := context.Background()
	password := "profile-test-password-123"

	user, e := server.Store.CreateUser(ctx, store.ID("profile")+"@example.com", "Before", password)
	if e != nil {
		t.Fatal(e)
	}

	other, e := server.Store.CreateUser(ctx, store.ID("profile")+"@example.com", "Other", password)
	if e != nil {
		t.Fatal(e)
	}

	t.Cleanup(func() {
		server.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE id=ANY($1)", []string{user.ID, other.ID})
	})
	status, body := request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": user.Email, "password": password}, "")
	expect(t, status, 200, body)
	token := str(object(body, "data"), "token")
	updatedEmail := store.ID("updated") + "@example.com"
	status, body = request(t, h.URL, token, "PATCH", "/auth/v1/me", store.Object{"name": "Updated name", "email": updatedEmail, "language": "pt", "avatar_variant": 42}, "")
	expect(t, status, 200, body)
	profile := object(object(body, "data"), "user")
	if str(profile, "name") != "Updated name" || str(profile, "email") != updatedEmail || str(profile, "language") != "pt" || profile["avatar_variant"] != float64(42) {
		t.Fatalf("unexpected profile: %#v", profile)
	}

	status, body = request(t, h.URL, token, "PATCH", "/auth/v1/me", store.Object{"email": other.Email}, "")
	expect(t, status, 409, body)
	status, body = request(t, h.URL, token, "PATCH", "/auth/v1/me", store.Object{"language": "fr"}, "")
	expect(t, status, 422, body)
	status, body = request(t, h.URL, "invalid", "PATCH", "/auth/v1/me", store.Object{"name": "No"}, "")
	expect(t, status, 401, body)
}

func TestDeleteConsoleUserRevokesSessionsAndProtectsLastOperator(t *testing.T) {
	server, h, _, projectKey := fixture(t)
	ctx := context.Background()
	password := "delete-test-password-123"

	first, e := server.Store.CreateUser(ctx, store.ID("delete")+"@example.com", "First", password)
	if e != nil {
		t.Fatal(e)
	}

	second, e := server.Store.CreateUser(ctx, store.ID("delete")+"@example.com", "Second", password)
	if e != nil {
		t.Fatal(e)
	}

	t.Cleanup(func() {
		server.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE id=ANY($1)", []string{first.ID, second.ID})
	})

	login := func(email string) string {
		status, o := request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": password}, "")
		expect(t, status, 200, o)

		return str(object(o, "data"), "token")
	}
	token, victimToken := login(first.Email), login(second.Email)
	status, o := request(t, h.URL, projectKey, "DELETE", "/admin/v1/users/"+second.ID, nil, "")
	expect(t, status, 401, o)
	status, o = request(t, h.URL, token, "DELETE", "/admin/v1/users/"+second.ID, nil, "")
	expect(t, status, 204, o)
	status, o = request(t, h.URL, victimToken, "GET", "/admin/v1/users", nil, "")
	expect(t, status, 401, o)
	status, o = request(t, h.URL, token, "DELETE", "/admin/v1/users/"+first.ID, nil, "")
	expect(t, status, 409, o)
	status, o = request(t, h.URL, token, "DELETE", "/admin/v1/users/"+second.ID, nil, "")
	expect(t, status, 404, o)
}

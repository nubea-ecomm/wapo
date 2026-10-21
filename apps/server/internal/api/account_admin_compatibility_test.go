package api

import (
	"context"
	"testing"

	"wapo.local/server/internal/store"
)

func TestAdministrativeResetPreservesProjectRolesAndRevokesRecovery(t *testing.T) {
	s, h, _, _ := fixture(t)
	email, session, id := signupAccount(t, s, h.URL)
	ctx := context.Background()

	root, err := s.Store.CreateUser(ctx, store.ID("root")+"@example.com", "Root", "root-test-password-123")
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { s.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE id=$1", root.ID) })

	s.Config.AdminKey = "admin-reset-test"
	status, body := request(t, h.URL, session, "POST", "/auth/v1/projects", store.Object{"name": "Owned"}, "")
	expect(t, status, 201, body)
	project := str(object(body, "data"), "id")

	t.Cleanup(func() { s.Store.Pool.Exec(ctx, "DELETE FROM projects WHERE id=$1", project) })
	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover", store.Object{"email": email}, "")
	expect(t, status, 200, body)
	token := authMailToken(t, s, email, "token")
	status, body = request(t, h.URL, "admin-reset-test", "PATCH", "/admin/v1/users/"+id, store.Object{"password": "admin-replacement-password"}, "")
	expect(t, status, 200, body)

	var role string

	if err = s.Store.Pool.QueryRow(ctx, "SELECT role FROM console_user_projects WHERE user_id=$1 AND project_id=$2", id, project).Scan(&role); err != nil || role != "admin" {
		t.Fatalf("password reset replaced project roles: %s %v", role, err)
	}

	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover/end", store.Object{"token": token, "password": "old-link-password-123"}, "")
	expect(t, status, 422, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "admin-replacement-password"}, "")
	expect(t, status, 200, body)
	session = str(object(body, "data"), "token")
	newEmail := store.ID("changed") + "@example.com"

	t.Cleanup(func() { s.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE id=$1", id) })
	status, body = request(t, h.URL, session, "PATCH", "/auth/v1/me", store.Object{"email": newEmail}, "")
	expect(t, status, 422, body)
	status, body = request(t, h.URL, "admin-reset-test", "PATCH", "/admin/v1/users/"+id, store.Object{"email": newEmail}, "")
	expect(t, status, 200, body)
	status, body = request(t, h.URL, session, "GET", "/auth/v1/me", nil, "")
	expect(t, status, 401, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": newEmail, "password": "admin-replacement-password"}, "")
	expect(t, status, 200, body)
}

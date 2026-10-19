package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"testing"
	"wapo.local/server/internal/store"
)

func scopedRequest(t *testing.T, base, key, project, method, path string, body any) (int, store.Object) {
	t.Helper()
	raw, _ := json.Marshal(body)
	req, _ := http.NewRequest(method, base+path, bytes.NewReader(raw))
	req.Header.Set("X-API-Key", key)
	req.Header.Set("X-Tenant-ID", project)
	req.Header.Set("Content-Type", "application/json")
	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}
	defer res.Body.Close()
	var out store.Object
	if res.StatusCode != 204 {
		if e = json.NewDecoder(res.Body).Decode(&out); e != nil {
			t.Fatal(e)
		}
	}
	return res.StatusCode, out
}
func TestUserRolesAndProjectAssignmentsAreEnforcedOnExistingSessions(t *testing.T) {
	server, h, p, _ := fixture(t)
	ctx := context.Background()
	server.Config.AdminKey = "permissions-admin"
	root, e := server.Store.CreateUser(ctx, store.ID("root")+"@example.com", "Root", "test-password-123456")
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { server.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE id=$1", root.ID) })
	other := store.ID("permissions-project")
	if e = server.Store.Bootstrap(ctx, other, store.ID("key")); e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() {
		server.Store.Pool.Exec(ctx, "DELETE FROM api_keys WHERE project_id=$1", other)
		server.Store.Pool.Exec(ctx, "DELETE FROM projects WHERE id=$1", other)
	})
	for _, role := range []string{"viewer", "member", "billing", "admin"} {
		t.Run(role, func(t *testing.T) {
			email := store.ID(role) + "@example.com"
			status, o := request(t, h.URL, "permissions-admin", "POST", "/admin/v1/users", store.Object{"name": role, "email": email, "password": "test-password-123456", "role": role, "all_projects": false, "project_ids": []string{p}}, "")
			expect(t, status, 201, o)
			id := str(object(o, "data"), "id")
			t.Cleanup(func() { server.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE id=$1", id) })
			status, o = request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "test-password-123456"}, "")
			expect(t, status, 200, o)
			token := str(object(o, "data"), "token")
			status, o = request(t, h.URL, token, "GET", "/admin/v1/tenants", nil, "")
			expect(t, status, 200, o)
			projects := o["data"].([]any)
			if len(projects) != 1 || projects[0].(map[string]any)["id"] != p {
				t.Fatal("project assignment leaked")
			}
			status, o = request(t, h.URL, token, "GET", "/admin/v1/users", nil, "")
			expect(t, status, 403, o)
			status, o = scopedRequest(t, h.URL, token, other, "GET", "/v1/overview", nil)
			expect(t, status, 403, o)
			status, o = scopedRequest(t, h.URL, token, p, "GET", "/v1/overview", nil)
			expect(t, status, 200, o)
			expected := 200
			if role == "billing" {
				expected = 403
			}
			status, o = scopedRequest(t, h.URL, token, p, "GET", "/v1/customers", nil)
			expect(t, status, expected, o)
			expected = 201
			if role == "billing" || role == "viewer" {
				expected = 403
			}
			status, o = scopedRequest(t, h.URL, token, p, "POST", "/v1/customers", store.Object{"name": "Allowed"})
			expect(t, status, expected, o)
			expected = 201
			if role != "admin" {
				expected = 403
			}
			status, o = scopedRequest(t, h.URL, token, p, "POST", "/v1/api_keys", store.Object{"name": "Role test"})
			expect(t, status, expected, o)
			expected = 200
			if role != "admin" {
				expected = 403
			}
			status, o = scopedRequest(t, h.URL, token, p, "PATCH", "/v1/project", store.Object{"branding": store.Object{"theme": "dark"}})
			expect(t, status, expected, o)
			status, o = request(t, h.URL, "permissions-admin", "PATCH", "/admin/v1/users/"+id, store.Object{"role": "viewer", "project_ids": []string{other}}, "")
			expect(t, status, 200, o)
			status, o = scopedRequest(t, h.URL, token, p, "GET", "/v1/overview", nil)
			expect(t, status, 403, o)
			status, o = scopedRequest(t, h.URL, token, other, "GET", "/v1/overview", nil)
			expect(t, status, 200, o)
			status, o = scopedRequest(t, h.URL, token, other, "POST", "/v1/customers", store.Object{"name": "Blocked"})
			expect(t, status, 403, o)
		})
	}
	status, o := request(t, h.URL, "permissions-admin", "PATCH", "/admin/v1/users/"+root.ID, store.Object{"role": "viewer"}, "")
	expect(t, status, 409, o)
}

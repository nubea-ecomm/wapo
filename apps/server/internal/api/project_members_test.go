package api

import (
	"context"
	"testing"

	"wapo.local/server/internal/store"
)

func TestSelfServiceProjectIsolationAndInvitations(t *testing.T) {
	s, h, other, _ := fixture(t)
	_, owner, ownerID := signupAccount(t, s, h.URL)
	ctx := context.Background()
	status, body := request(t, h.URL, owner, "POST", "/auth/v1/projects", store.Object{"name": "My workspace"}, "")
	expect(t, status, 201, body)
	p := str(object(body, "data"), "id")

	t.Cleanup(func() {
		s.Store.Pool.Exec(ctx, "DELETE FROM customers WHERE project_id=$1", p)
		s.Store.Pool.Exec(ctx, "DELETE FROM projects WHERE id=$1", p)
	})
	status, body = scopedRequest(t, h.URL, owner, other, "GET", "/v1/overview", nil)
	expect(t, status, 403, body)
	status, body = scopedRequest(t, h.URL, owner, p, "POST", "/v1/customers", store.Object{"name": "Owned customer"})
	expect(t, status, 201, body)
	status, body = request(t, h.URL, owner, "POST", "/admin/v1/tenants", store.Object{"name": "Forbidden"}, "")
	expect(t, status, 403, body)
	status, body = scopedRequest(t, h.URL, owner, p, "DELETE", "/v1/members/"+ownerID, nil)
	expect(t, status, 409, body)
	email, member, memberID := signupAccount(t, s, h.URL)
	status, body = scopedRequest(t, h.URL, owner, p, "POST", "/v1/members", store.Object{"email": email, "role": "viewer"})
	expect(t, status, 201, body)
	invitation := authMailToken(t, s, email, "token")
	status, body = request(t, h.URL, owner, "POST", "/auth/v1/project-invitations/"+invitation, nil, "")
	expect(t, status, 410, body)
	status, body = request(t, h.URL, member, "POST", "/auth/v1/project-invitations/"+invitation, nil, "")
	expect(t, status, 200, body)
	status, body = request(t, h.URL, member, "POST", "/auth/v1/project-invitations/"+invitation, nil, "")
	expect(t, status, 410, body)
	status, body = scopedRequest(t, h.URL, member, p, "GET", "/v1/customers", nil)
	expect(t, status, 200, body)
	status, body = scopedRequest(t, h.URL, member, p, "POST", "/v1/customers", store.Object{"name": "Forbidden"})
	expect(t, status, 403, body)
	status, body = scopedRequest(t, h.URL, member, p, "GET", "/v1/members", nil)
	expect(t, status, 403, body)
	status, body = scopedRequest(t, h.URL, owner, p, "PATCH", "/v1/members/"+memberID, store.Object{"role": "member"})
	expect(t, status, 200, body)
	status, body = scopedRequest(t, h.URL, member, p, "POST", "/v1/customers", store.Object{"name": "Now allowed"})
	expect(t, status, 201, body)
	status, body = scopedRequest(t, h.URL, owner, p, "DELETE", "/v1/members/"+memberID, nil)
	expect(t, status, 200, body)
	status, body = scopedRequest(t, h.URL, member, p, "GET", "/v1/customers", nil)
	expect(t, status, 403, body)
}

package api

import (
	"context"
	"testing"

	"wapo.local/server/internal/store"
)

func TestReplacedAndRevokedInvitationsCannotRestoreAccess(t *testing.T) {
	s, h, p, _ := fixture(t)
	_, owner, ownerID := signupAccount(t, s, h.URL)
	email, member, memberID := signupAccount(t, s, h.URL)
	ctx := context.Background()

	if _, err := s.Store.Pool.Exec(ctx, "INSERT INTO console_user_projects(user_id,project_id,role) VALUES($1,$2,'admin')", ownerID, p); err != nil {
		t.Fatal(err)
	}

	invite := func(role string) string {
		status, body := scopedRequest(t, h.URL, owner, p, "POST", "/v1/members", store.Object{"email": email, "role": role})
		expect(t, status, 201, body)

		return authMailToken(t, s, email, "token")
	}
	old := invite("admin")
	current := invite("viewer")
	status, body := request(t, h.URL, member, "POST", "/auth/v1/project-invitations/"+old, nil, "")
	expect(t, status, 410, body)
	status, body = request(t, h.URL, member, "POST", "/auth/v1/project-invitations/"+current, nil, "")
	expect(t, status, 200, body)

	pending := invite("admin")
	status, body = scopedRequest(t, h.URL, owner, p, "DELETE", "/v1/members/"+memberID, nil)
	expect(t, status, 200, body)
	status, body = request(t, h.URL, member, "POST", "/auth/v1/project-invitations/"+pending, nil, "")
	expect(t, status, 410, body)
	status, body = scopedRequest(t, h.URL, member, p, "GET", "/v1/overview", nil)
	expect(t, status, 403, body)
	// Operator assignment changes must also invalidate previously offered access.
	pending = invite("admin")

	tx, err := s.Store.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)

	if err = saveUserAccess(ctx, tx, memberID, userAccess{Role: "member", Projects: []string{}}); err != nil {
		t.Fatal(err)
	}

	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	status, body = request(t, h.URL, member, "POST", "/auth/v1/project-invitations/"+pending, nil, "")
	expect(t, status, 410, body)
}

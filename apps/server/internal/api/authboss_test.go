package api

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"testing"

	"wapo.local/server/internal/store"
)

func authMailToken(t *testing.T, s *Server, email, param string) string {
	t.Helper()

	var payload store.Object

	err := s.Store.Pool.QueryRow(context.Background(), `SELECT payload FROM notification_deliveries WHERE notification_type='auth_mail' AND recipients=ARRAY[$1]::text[] ORDER BY created_at DESC,id DESC LIMIT 1`, email).Scan(&payload)
	if err != nil {
		t.Fatal(err)
	}

	sealed := str(payload, "invitation_token")

	plain, err := s.Store.Unseal(sealed, str(payload, "invitation_id"))
	if err != nil {
		t.Fatal(err)
	}

	var mail store.Object

	if err = json.Unmarshal([]byte(plain), &mail); err != nil {
		t.Fatal(err)
	}

	parts := strings.Split(str(mail, "text"), "\n\n")
	link := parts[len(parts)-1]

	parsed, err := url.Parse(link)
	if err != nil {
		t.Fatal(err)
	}

	query, err := url.ParseQuery(strings.SplitN(parsed.Fragment, "?", 2)[1])
	if err != nil {
		t.Fatal(err)
	}

	token := query.Get(param)
	if token == "" || strings.Contains(sealed, token) {
		t.Fatal("missing token or plaintext token in outbox")
	}

	return token
}

func signupAccount(t *testing.T, s *Server, base string) (email, token, id string) {
	t.Helper()

	email = store.ID("signup") + "@example.com"
	s.Config.SMTPHost = "fake.invalid"
	status, body := request(t, base, "", "POST", "/auth/v1/register", store.Object{"email": email, "name": "Account", "password": "signup-password-123", "role": "admin", "all_projects": true}, "")
	t.Cleanup(func() {
		s.Store.Pool.Exec(context.Background(), "DELETE FROM console_users WHERE email=$1", email)
		s.Store.Pool.Exec(context.Background(), "DELETE FROM notification_deliveries WHERE recipients=ARRAY[$1]::text[]", email)
	})
	expect(t, status, 200, body)
	registered := body

	if str(object(body, "data"), "token") == "" {
		t.Fatal("registration did not sign the account in")
	}

	// Signing up needs no further step: the same credentials work right away.
	status, body = request(t, base, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "signup-password-123"}, "")
	expect(t, status, 200, body)
	status, body = request(t, base, str(object(body, "data"), "token"), "POST", "/auth/v1/logout", nil, "")
	expect(t, status, 200, body)
	body = registered
	data := object(body, "data")
	u := object(data, "user")

	if u["all_projects"] != false || u["role"] != "member" {
		t.Fatal("signup granted platform privileges")
	}

	return email, str(data, "token"), str(u, "id")
}

func TestAuthbossSignupRecoveryAndRevocation(t *testing.T) {
	s, h, _, _ := fixture(t)
	email, session, id := signupAccount(t, s, h.URL)
	status, body := request(t, h.URL, session, "GET", "/admin/v1/users", nil, "")
	expect(t, status, 403, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover", store.Object{"email": email}, "")
	expect(t, status, 200, body)
	token := authMailToken(t, s, email, "token")
	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover/end", store.Object{"token": token, "password": "short"}, "")
	expect(t, status, 422, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover/end", store.Object{"token": token, "password": "replacement-password-123"}, "")
	expect(t, status, 200, body)
	status, body = request(t, h.URL, session, "GET", "/auth/v1/me", nil, "")
	expect(t, status, 401, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover/end", store.Object{"token": token, "password": "replacement-password-456"}, "")
	expect(t, status, 422, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "signup-password-123"}, "")
	expect(t, status, 401, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "replacement-password-123"}, "")
	expect(t, status, 200, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover", store.Object{"email": "absent@example.com"}, "")
	expect(t, status, 200, body)
	s.Store.Pool.Exec(context.Background(), "UPDATE console_users SET active=false WHERE id=$1", id)

	status, body = request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "replacement-password-123"}, "")
	expect(t, status, 401, body)
}

func TestRegistrationWithInvitationJoinsProjectInOneStep(t *testing.T) {
	s, h, _, _ := fixture(t)
	ctx := context.Background()
	_, owner, _ := signupAccount(t, s, h.URL)
	status, body := request(t, h.URL, owner, "POST", "/auth/v1/projects", store.Object{"name": "Invited workspace"}, "")
	expect(t, status, 201, body)
	p := str(object(body, "data"), "id")
	email := store.ID("invitee") + "@example.com"

	t.Cleanup(func() {
		s.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE email=$1", email)
		s.Store.Pool.Exec(ctx, "DELETE FROM notification_deliveries WHERE recipients=ARRAY[$1]::text[]", email)
		s.Store.Pool.Exec(ctx, "DELETE FROM projects WHERE id=$1", p)
	})
	status, body = scopedRequest(t, h.URL, owner, p, "POST", "/v1/members", store.Object{"email": email, "role": "member"})
	expect(t, status, 201, body)
	invitation := authMailToken(t, s, email, "token")

	status, body = request(t, h.URL, "", "GET", "/auth/v1/project-invitations/"+invitation, nil, "")
	expect(t, status, 200, body)
	preview := object(body, "data")

	if str(preview, "email") != email || str(preview, "project_name") != "Invited workspace" || preview["account_exists"] != false {
		t.Fatalf("unexpected invitation preview: %v", preview)
	}

	// The token only works for the invited address; nothing is created otherwise.
	intruder := store.ID("intruder") + "@example.com"
	status, body = request(t, h.URL, "", "POST", "/auth/v1/register", store.Object{"email": intruder, "name": "Intruder", "password": "signup-password-123", "invitation_token": invitation}, "")
	expect(t, status, 410, body)

	var count int

	if err := s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM console_users WHERE email=$1", intruder).Scan(&count); err != nil || count != 0 {
		t.Fatalf("rejected registration was not rolled back: %d %v", count, err)
	}

	status, body = request(t, h.URL, "", "POST", "/auth/v1/register", store.Object{"email": email, "name": "Invitee", "password": "signup-password-123", "invitation_token": invitation}, "")
	expect(t, status, 200, body)
	data := object(body, "data")

	if str(object(data, "invitation"), "project_id") != p {
		t.Fatalf("registration did not join the invited project: %v", data)
	}

	status, body = scopedRequest(t, h.URL, str(data, "token"), p, "GET", "/v1/customers", nil)
	expect(t, status, 200, body)
	status, body = request(t, h.URL, "", "GET", "/auth/v1/project-invitations/"+invitation, nil, "")
	expect(t, status, 410, body)
}

func TestLegacyVerificationEndpointsAreNoOps(t *testing.T) {
	_, h, _, _ := fixture(t)

	for _, path := range []string{"/auth/v1/confirm", "/auth/v1/confirm/resend"} {
		status, body := request(t, h.URL, "", "POST", path, store.Object{"token": "old", "email": "old@example.com"}, "")
		expect(t, status, 200, body)
	}
}

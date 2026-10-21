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
	expect(t, status, 200, body)
	t.Cleanup(func() {
		s.Store.Pool.Exec(context.Background(), "DELETE FROM console_users WHERE email=$1", email)
		s.Store.Pool.Exec(context.Background(), "DELETE FROM notification_deliveries WHERE recipients=ARRAY[$1]::text[]", email)
	})
	status, body = request(t, base, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "signup-password-123"}, "")
	expect(t, status, 403, body)
	confirmation := authMailToken(t, s, email, "cnf")
	status, body = request(t, base, "", "POST", "/auth/v1/confirm", store.Object{"token": confirmation}, "")
	expect(t, status, 200, body)
	status, body = request(t, base, "", "POST", "/auth/v1/confirm", store.Object{"token": confirmation}, "")
	expect(t, status, 422, body)
	status, body = request(t, base, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "signup-password-123"}, "")
	expect(t, status, 200, body)
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

func TestAuthbossOutboxFailureRollsBackRegistration(t *testing.T) {
	s, h, _, _ := fixture(t)
	s.Config.SMTPHost = "fake.invalid"
	ctx := context.Background()
	// A NOT VALID constraint also applies to newly inserted deliveries.
	_, err := s.Store.Pool.Exec(ctx, `ALTER TABLE notification_deliveries ADD CONSTRAINT reject_auth_test CHECK(notification_type<>'auth_mail') NOT VALID`)
	if err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { s.Store.Pool.Exec(ctx, "ALTER TABLE notification_deliveries DROP CONSTRAINT reject_auth_test") })

	email := store.ID("rollback") + "@example.com"
	status, body := request(t, h.URL, "", "POST", "/auth/v1/register", store.Object{"email": email, "name": "Rollback", "password": "signup-password-123"}, "")

	if status < 400 {
		t.Fatalf("outbox failure reported success: %v", body)
	}

	var count int

	if err = s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM console_users WHERE email=$1", email).Scan(&count); err != nil || count != 0 {
		t.Fatalf("registration was not atomic: %d %v", count, err)
	}
}

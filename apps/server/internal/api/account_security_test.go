package api

import (
	"context"
	"testing"

	"wapo.local/server/internal/store"
)

func TestAccountSessionsAndPasswordChange(t *testing.T) {
	s, h, _, _ := fixture(t)
	email, first, _ := signupAccount(t, s, h.URL)
	_, other, _ := signupAccount(t, s, h.URL)
	status, body := request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "signup-password-123"}, "")
	expect(t, status, 200, body)
	second := str(object(body, "data"), "token")
	status, body = request(t, h.URL, first, "GET", "/auth/v1/sessions", nil, "")
	expect(t, status, 200, body)
	sessions := body["data"].([]any)
	if len(sessions) != 2 {
		t.Fatalf("expected two sessions: %v", sessions)
	}

	var id string

	for _, value := range sessions {
		row := value.(map[string]any)
		if row["current"] == false {
			id = row["id"].(string)
		}

		if row["hash"] != nil || row["token"] != nil {
			t.Fatal("session credential leaked")
		}
	}

	status, body = request(t, h.URL, other, "DELETE", "/auth/v1/sessions/"+id, nil, "")
	expect(t, status, 404, body)
	status, body = request(t, h.URL, first, "DELETE", "/auth/v1/sessions/"+id, nil, "")
	expect(t, status, 200, body)
	status, body = request(t, h.URL, second, "GET", "/auth/v1/me", nil, "")
	expect(t, status, 401, body)
	status, body = request(t, h.URL, first, "POST", "/auth/v1/password", store.Object{"current_password": "wrong", "password": "new-account-password-123"}, "")
	expect(t, status, 401, body)
	status, body = request(t, h.URL, first, "POST", "/auth/v1/password", store.Object{"current_password": "signup-password-123", "password": "new-account-password-123"}, "")
	expect(t, status, 200, body)
	status, body = request(t, h.URL, first, "GET", "/auth/v1/me", nil, "")
	expect(t, status, 401, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": "new-account-password-123"}, "")
	expect(t, status, 200, body)
}

func TestVerificationReplacementAndExpiredRecovery(t *testing.T) {
	s, h, _, _ := fixture(t)
	s.Config.SMTPHost = "fake.invalid"
	email := store.ID("expiry") + "@example.com"
	ctx := context.Background()

	t.Cleanup(func() {
		s.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE email=$1", email)
		s.Store.Pool.Exec(ctx, "DELETE FROM notification_deliveries WHERE recipients=ARRAY[$1]::text[]", email)
	})
	status, body := request(t, h.URL, "", "POST", "/auth/v1/register", store.Object{"email": email, "name": "Expiry", "password": "signup-password-123"}, "")
	expect(t, status, 200, body)
	old := authMailToken(t, s, email, "cnf")
	status, body = request(t, h.URL, "", "POST", "/auth/v1/confirm/resend", store.Object{"email": email}, "")
	expect(t, status, 200, body)
	current := authMailToken(t, s, email, "cnf")
	status, body = request(t, h.URL, "", "POST", "/auth/v1/confirm", store.Object{"token": old}, "")
	expect(t, status, 422, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/confirm", store.Object{"token": current}, "")
	expect(t, status, 200, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover", store.Object{"email": email}, "")
	expect(t, status, 200, body)
	token := authMailToken(t, s, email, "token")
	if _, err := s.Store.Pool.Exec(ctx, "UPDATE console_users SET recover_expires_at=now()-interval '1 second' WHERE email=$1", email); err != nil {
		t.Fatal(err)
	}

	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover/end", store.Object{"token": token, "password": "replacement-password-123"}, "")
	expect(t, status, 422, body)
}

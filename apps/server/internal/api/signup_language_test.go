package api

import (
	"context"
	"testing"

	"wapo.local/server/internal/store"
)

func TestSignupPersistsSelectedLanguage(t *testing.T) {
	s, h, _, _ := fixture(t)
	s.Config.SMTPHost = "fake.invalid"
	email := store.ID("language") + "@example.com"
	ctx := context.Background()

	t.Cleanup(func() {
		s.Store.Pool.Exec(ctx, "DELETE FROM notification_deliveries WHERE recipients=ARRAY[$1]::text[]", email)
		s.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE email=$1", email)
	})
	status, body := request(t, h.URL, "", "POST", "/auth/v1/register", store.Object{"name": "Language", "email": email, "password": "signup-password-123", "language": "pt"}, "")
	expect(t, status, 200, body)

	var language string

	if err := s.Store.Pool.QueryRow(ctx, "SELECT language FROM console_users WHERE email=$1", email).Scan(&language); err != nil || language != "pt" {
		t.Fatalf("signup language not persisted: %s %v", language, err)
	}

	status, body = request(t, h.URL, "", "POST", "/auth/v1/register", store.Object{"name": "Invalid", "email": email, "password": "signup-password-123", "language": "unsupported"}, "")
	expect(t, status, 422, body)
}

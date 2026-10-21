package api

import (
	"context"
	"net/http"
	"testing"

	"wapo.local/server/internal/store"
)

func TestConsoleProductionPreflight(t *testing.T) {
	_, h, _, _ := fixture(t)
	for _, origin := range []string{"https://console.getwapo.dev", "https://preview.getwapo.dev", "https://console.getwapo.dev.evil.example"} {
		req, _ := http.NewRequest("OPTIONS", h.URL+"/auth/v1/login", nil)
		req.Header.Set("Origin", origin)
		req.Header.Set("Access-Control-Request-Method", "POST")
		req.Header.Set("Access-Control-Request-Headers", "content-type,x-api-key")

		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}

		res.Body.Close()

		want := origin
		if origin == "https://console.getwapo.dev.evil.example" {
			want = ""
		}

		if res.StatusCode != 204 || res.Header.Get("Access-Control-Allow-Origin") != want || res.Header.Get("Vary") != "Origin" {
			t.Fatalf("invalid preflight for %s: %d %v", origin, res.StatusCode, res.Header)
		}
	}
}

func TestAllProjectNonAdminsCannotChangeVerifiedEmail(t *testing.T) {
	s, h, _, _ := fixture(t)
	_, token, id := signupAccount(t, s, h.URL)

	for _, role := range []string{"member", "viewer", "billing"} {
		if _, err := s.Store.Pool.Exec(context.Background(), "UPDATE console_users SET role=$2,all_projects=true WHERE id=$1", id, role); err != nil {
			t.Fatal(err)
		}

		status, body := request(t, h.URL, token, "PATCH", "/auth/v1/me", store.Object{"email": "someone-else@example.com"}, "")
		expect(t, status, 422, body)
	}
}

func TestIssuedEmailTokensWorkWithoutSMTP(t *testing.T) {
	s, h, _, _ := fixture(t)
	email, _, _ := signupAccount(t, s, h.URL)
	status, body := request(t, h.URL, "", "POST", "/auth/v1/recover", store.Object{"email": email}, "")
	expect(t, status, 200, body)
	token := authMailToken(t, s, email, "token")
	s.Config.SMTPHost = ""
	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover/end", store.Object{"token": token, "password": "replacement-password-123"}, "")
	expect(t, status, 200, body)
	status, body = request(t, h.URL, "", "POST", "/auth/v1/recover", store.Object{"email": email}, "")
	expect(t, status, 503, body)
}

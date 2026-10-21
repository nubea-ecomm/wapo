package api

import (
	"context"
	"strings"
	"testing"
	"time"

	"wapo.local/server/internal/notification"
	"wapo.local/server/internal/store"
)

func TestAuthbossEmailWorkerDeliversAndErasesEncryptedBody(t *testing.T) {
	s, h, _, _ := fixture(t)
	s.Config.SMTPHost = "fake.invalid"
	email := store.ID("auth-mail") + "@example.com"
	ctx := context.Background()

	t.Cleanup(func() {
		s.Store.Pool.Exec(ctx, "DELETE FROM console_users WHERE email=$1", email)
		s.Store.Pool.Exec(ctx, "DELETE FROM notification_deliveries WHERE recipients=ARRAY[$1]::text[]", email)
	})
	status, body := request(t, h.URL, "", "POST", "/auth/v1/register", store.Object{"email": email, "name": "Mail recipient", "password": "signup-password-123"}, "")
	expect(t, status, 200, body)
	token := authMailToken(t, s, email, "cnf")
	workerCtx, cancel := context.WithCancel(ctx)
	captured := make(invitationCapture, 32)
	done := make(chan struct{})

	go func() {
		notification.Run(workerCtx, s.Store, captured, "https://unused-worker-origin.example")
		close(done)
	}()

	t.Cleanup(func() { cancel(); <-done })

	select {
	case message := <-captured:
		if len(message.To) != 1 || message.To[0] != email || !strings.Contains(message.Text, "http://localhost:5173/#/confirm?cnf=") || !strings.Contains(message.HTML, "Continuar en Wapo") {
			t.Fatalf("unexpected authentication message: %#v", message)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("authentication email was not delivered")
	}

	cancel()
	<-done

	var payload, state string

	if err := s.Store.Pool.QueryRow(ctx, "SELECT state,payload::text FROM notification_deliveries WHERE recipients=ARRAY[$1]::text[]", email).Scan(&state, &payload); err != nil {
		t.Fatal(err)
	}

	if state != "sent" || strings.Contains(payload, "invitation_token") {
		t.Fatalf("email body was not erased: %s %s", state, payload)
	}

	status, body = request(t, h.URL, "", "POST", "/auth/v1/confirm", store.Object{"token": token}, "")
	expect(t, status, 200, body)
}

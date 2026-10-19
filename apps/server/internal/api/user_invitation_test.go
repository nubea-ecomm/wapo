package api

import (
	"context"
	"net/url"
	"strings"
	"testing"
	"time"

	"wapo.local/server/internal/notification"
	"wapo.local/server/internal/store"
)

type invitationCapture chan notification.Message

func (capture invitationCapture) Send(_ context.Context, message notification.Message) error {
	capture <- message
	return nil
}

func TestSMTPUserInvitationCanBeAcceptedOnce(t *testing.T) {
	server, httpServer, project, _ := fixture(t)
	server.Config.AdminKey = "invitation-admin-key"
	server.Config.SMTPHost = "smtp.example.com"
	email := store.ID("invitee") + "@example.com"

	status, body := request(t, httpServer.URL, server.Config.AdminKey, "POST", "/admin/v1/users", store.Object{"name": "Invited member", "email": email, "role": "member", "all_projects": false, "project_ids": []string{project}}, "")
	expect(t, status, 201, body)
	user := object(body, "data")
	if user["active"] != false || user["invitation_pending"] != true {
		t.Fatalf("invited user was activated before acceptance: %#v", user)
	}

	userID := str(user, "id")

	t.Cleanup(func() {
		server.Store.Pool.Exec(context.Background(), "DELETE FROM notification_deliveries WHERE notification_type='user_invitation' AND recipients @> ARRAY[$1]", email)
		server.Store.Pool.Exec(context.Background(), "DELETE FROM console_users WHERE id=$1", userID)
	})
	status, body = request(t, httpServer.URL, server.Config.AdminKey, "PATCH", "/admin/v1/users/"+userID, store.Object{"active": true}, "")
	expect(t, status, 409, body)

	workerCtx, cancel := context.WithCancel(context.Background())
	captured := make(invitationCapture, 1)
	done := make(chan struct{})

	go func() {
		notification.Run(workerCtx, server.Store, captured, "https://console.example.com")
		close(done)
	}()

	var message notification.Message

	select {
	case message = <-captured:
	case <-time.After(5 * time.Second):
		cancel()
		<-done
		t.Fatal("invitation email was not delivered")
	}

	cancel()
	<-done

	if message.Subject != "Te invitaron a Wapo" || !strings.Contains(message.HTML, "Aceptar invitación") {
		t.Fatalf("unexpected invitation message: %#v", message)
	}

	marker := "token="
	start := strings.Index(message.Text, marker)

	if start < 0 {
		t.Fatal("invitation link has no token")
	}

	token, err := url.QueryUnescape(strings.TrimSpace(message.Text[start+len(marker):]))
	if err != nil || token == "" {
		t.Fatalf("invalid invitation token: %q %v", token, err)
	}

	var payload string

	if err = server.Store.Pool.QueryRow(context.Background(), "SELECT payload::text FROM notification_deliveries WHERE notification_type='user_invitation' AND recipients @> ARRAY[$1]", email).Scan(&payload); err != nil || strings.Contains(payload, token) || strings.Contains(payload, "invitation_token") {
		t.Fatalf("raw invitation token was persisted: error=%v", err)
	}

	status, body = request(t, httpServer.URL, "", "GET", "/auth/v1/invitations/"+url.PathEscape(token), nil, "")
	expect(t, status, 200, body)

	password := "accepted-password-123"
	status, body = request(t, httpServer.URL, "", "POST", "/auth/v1/invitations/"+url.PathEscape(token), store.Object{"password": password}, "")
	expect(t, status, 200, body)
	status, body = request(t, httpServer.URL, "", "POST", "/auth/v1/invitations/"+url.PathEscape(token), store.Object{"password": password}, "")
	expect(t, status, 410, body)
	status, body = request(t, httpServer.URL, "", "POST", "/auth/v1/login", store.Object{"email": email, "password": password}, "")
	expect(t, status, 200, body)
}

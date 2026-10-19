package api

import (
	"context"
	"testing"

	"wapo.local/server/internal/store"
)

func TestNotificationSettingsValidationAndIsolation(t *testing.T) {
	server, h, project, key := fixture(t)
	server.Config.SMTPHost = "smtp.example.com"

	status, body := request(t, h.URL, key, "GET", "/v1/notification-settings", nil, "")
	expect(t, status, 200, body)
	defaults := object(body, "data")
	if defaults["smtp_configured"] != true || defaults["weekly_stats"] != true || len(defaults["recipients"].([]any)) != 0 {
		t.Fatalf("unexpected defaults: %#v", defaults)
	}

	status, body = request(t, h.URL, key, "PATCH", "/v1/notification-settings", store.Object{"recipients": []string{"OPS@example.com", "ops@example.com"}, "daily_stats": true}, "")
	expect(t, status, 200, body)
	updated := object(body, "data")
	if updated["daily_stats"] != true || len(updated["recipients"].([]any)) != 1 || updated["recipients"].([]any)[0] != "ops@example.com" {
		t.Fatalf("settings were not normalized: %#v", updated)
	}

	status, body = request(t, h.URL, key, "PATCH", "/v1/notification-settings", store.Object{"recipients": []string{"not-an-email"}}, "")
	expect(t, status, 422, body)

	_, otherHTTP, _, otherKey := fixture(t)
	status, body = request(t, otherHTTP.URL, otherKey, "GET", "/v1/notification-settings", nil, "")
	expect(t, status, 200, body)

	if len(object(body, "data")["recipients"].([]any)) != 0 {
		t.Fatal("notification recipients leaked across projects")
	}

	var count int

	if err := server.Store.Pool.QueryRow(context.Background(), "SELECT count(*) FROM notification_settings WHERE project_id=$1", project).Scan(&count); err != nil || count != 1 {
		t.Fatalf("settings were not persisted: count=%d error=%v", count, err)
	}
}

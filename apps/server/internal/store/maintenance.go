package store

import (
	"context"
	"log/slog"
	"time"
)

type MaintenanceResult struct {
	ExpiredSessions int64
	RequestLogs     int64
	AuditLogs       int64
	Journals        int64
	Deliveries      int64
	Events          int64
	SetupClaims     int64
	RateLimits      int64
	Notifications   int64
	Invitations     int64
}

func (s *Store) Maintain(ctx context.Context) (MaintenanceResult, error) {
	result := MaintenanceResult{}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return result, err
	}
	defer tx.Rollback(ctx)

	queries := []struct {
		target *int64
		sql    string
	}{
		{&result.ExpiredSessions, "DELETE FROM console_sessions WHERE expires_at<now()"},
		{&result.RequestLogs, "DELETE FROM request_logs WHERE created_at<now()-interval '30 days'"},
		{&result.AuditLogs, "DELETE FROM admin_audit_logs WHERE created_at<now()-interval '90 days'"},
		{&result.Journals, "DELETE FROM requests WHERE (state='complete' AND created_at<now()-interval '30 days') OR (state='pending' AND created_at<now()-interval '90 days')"},
		{&result.Deliveries, "DELETE FROM deliveries WHERE (state IN ('delivered','cancelled') AND updated_at<now()-interval '30 days') OR (state='failed' AND updated_at<now()-interval '90 days')"},
		{&result.Events, "DELETE FROM events e WHERE e.created_at<now()-interval '90 days' AND NOT EXISTS(SELECT 1 FROM deliveries d WHERE d.event_id=e.id)"},
		{&result.SetupClaims, `UPDATE resources SET data=(data-'completion_started_at')||'{"status":"active"}'::jsonb WHERE kind='setup_links' AND data->>'status'='processing' AND (data->>'completion_started_at')::timestamptz<now()-interval '15 minutes'`},
		{&result.RateLimits, "DELETE FROM rate_limit_counters WHERE window_start<now()-interval '10 minutes'"},
		{&result.Notifications, "DELETE FROM notification_deliveries WHERE (state='sent' AND updated_at<now()-interval '30 days') OR (state='failed' AND updated_at<now()-interval '90 days')"},
		{&result.Invitations, "DELETE FROM console_user_invitations WHERE (accepted_at IS NOT NULL AND accepted_at<now()-interval '30 days') OR (accepted_at IS NULL AND expires_at<now()-interval '30 days')"},
	}
	for _, query := range queries {
		tag, queryErr := tx.Exec(ctx, query.sql)
		if queryErr != nil {
			return result, queryErr
		}

		*query.target = tag.RowsAffected()
	}

	return result, tx.Commit(ctx)
}

func (s *Store) RunMaintenance(ctx context.Context) {
	run := func() {
		maintenanceCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
		defer cancel()

		if _, err := s.Maintain(maintenanceCtx); err != nil && ctx.Err() == nil {
			slog.Error("storage maintenance failed", "error", err)
		}
	}
	run()

	ticker := time.NewTicker(6 * time.Hour)

	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}

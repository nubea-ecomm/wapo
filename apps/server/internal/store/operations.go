package store

import "context"

type OperationalStats struct {
	UnresolvedRequests  int64 `json:"unresolved_requests"`
	FailedDeliveries    int64 `json:"failed_deliveries"`
	ExpiredCredentials  int64 `json:"expired_credentials"`
	StaleSetupClaims    int64 `json:"stale_setup_claims"`
	FailedNotifications int64 `json:"failed_notifications"`
}

func (s *Store) OperationalStats(ctx context.Context) (OperationalStats, error) {
	stats := OperationalStats{}
	err := s.Pool.QueryRow(ctx, `SELECT
		(SELECT count(*) FROM requests WHERE state='pending' AND created_at<now()-interval '15 minutes'),
		(SELECT count(*) FROM deliveries WHERE state='failed'),
		(SELECT count(*) FROM resources WHERE kind='connections' AND data->>'credential_status'='expired'),
		(SELECT count(*) FROM resources WHERE kind='setup_links' AND data->>'status'='processing' AND (data->>'completion_started_at')::timestamptz<now()-interval '15 minutes'),
		(SELECT count(*) FROM notification_deliveries WHERE state='failed')`).Scan(
		&stats.UnresolvedRequests,
		&stats.FailedDeliveries,
		&stats.ExpiredCredentials,
		&stats.StaleSetupClaims,
		&stats.FailedNotifications,
	)

	return stats, err
}

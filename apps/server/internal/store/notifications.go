package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type NotificationSettings struct {
	Recipients             []string `json:"recipients"`
	WhatsAppDisconnected   bool     `json:"whatsapp_disconnected"`
	CustomerNeedsAttention bool     `json:"customer_needs_attention"`
	DailyStats             bool     `json:"daily_stats"`
	WeeklyStats            bool     `json:"weekly_stats"`
}

type NotificationRecipient struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

func DefaultNotificationSettings() NotificationSettings {
	return NotificationSettings{Recipients: []string{}, WhatsAppDisconnected: true, CustomerNeedsAttention: true, WeeklyStats: true}
}

func (s *Store) NotificationSettings(ctx context.Context, project string) (NotificationSettings, error) {
	settings := DefaultNotificationSettings()
	err := s.Pool.QueryRow(ctx, `SELECT recipients,whatsapp_disconnected,customer_needs_attention,daily_stats,weekly_stats FROM notification_settings WHERE project_id=$1`, project).Scan(&settings.Recipients, &settings.WhatsAppDisconnected, &settings.CustomerNeedsAttention, &settings.DailyStats, &settings.WeeklyStats)

	if errors.Is(err, pgx.ErrNoRows) {
		return settings, nil
	}

	return settings, err
}

func (s *Store) SaveNotificationSettings(ctx context.Context, project string, settings NotificationSettings) error {
	_, err := s.Pool.Exec(ctx, `INSERT INTO notification_settings(project_id,recipients,whatsapp_disconnected,customer_needs_attention,daily_stats,weekly_stats) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(project_id) DO UPDATE SET recipients=EXCLUDED.recipients,whatsapp_disconnected=EXCLUDED.whatsapp_disconnected,customer_needs_attention=EXCLUDED.customer_needs_attention,daily_stats=EXCLUDED.daily_stats,weekly_stats=EXCLUDED.weekly_stats,updated_at=now()`, project, settings.Recipients, settings.WhatsAppDisconnected, settings.CustomerNeedsAttention, settings.DailyStats, settings.WeeklyStats)
	return err
}

func (s *Store) ProjectNotificationRecipients(ctx context.Context, project string) ([]NotificationRecipient, error) {
	rows, err := s.Pool.Query(ctx, `SELECT id,name,email FROM console_users users WHERE active AND (all_projects OR EXISTS(SELECT 1 FROM console_user_projects access WHERE access.user_id=users.id AND access.project_id=$1)) ORDER BY name,email`, project)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	recipients := []NotificationRecipient{}

	for rows.Next() {
		var recipient NotificationRecipient

		if err = rows.Scan(&recipient.ID, &recipient.Name, &recipient.Email); err != nil {
			return nil, err
		}

		recipients = append(recipients, recipient)
	}

	return recipients, rows.Err()
}

func EnqueueNotification(ctx context.Context, tx pgx.Tx, project, notificationType, dedupeKey string, payload Object) error {
	column := map[string]string{
		"whatsapp_disconnected":    "whatsapp_disconnected",
		"customer_needs_attention": "customer_needs_attention",
	}[notificationType]
	if column == "" {
		return errors.New("unsupported notification type")
	}

	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO notification_deliveries(id,project_id,notification_type,dedupe_key,recipients,payload)
		SELECT $1,$2,$3,$4,target.recipients,$5
		FROM notification_settings settings
		CROSS JOIN LATERAL (SELECT CASE WHEN cardinality(settings.recipients)>0 THEN settings.recipients ELSE ARRAY(
			SELECT email FROM console_users users WHERE users.active AND (users.all_projects OR EXISTS(
				SELECT 1 FROM console_user_projects access WHERE access.user_id=users.id AND access.project_id=settings.project_id
			)) ORDER BY email
		) END recipients) target
		WHERE settings.project_id=$2 AND cardinality(target.recipients)>0 AND settings.`+column+`
		ON CONFLICT(project_id,notification_type,dedupe_key) DO NOTHING`, ID("mail"), project, notificationType, dedupeKey, raw)

	return err
}

func (s *Store) QueueScheduledNotifications(ctx context.Context, now time.Time) error {
	daily := now.UTC().AddDate(0, 0, -1)
	dailyStart := time.Date(daily.Year(), daily.Month(), daily.Day(), 0, 0, 0, 0, time.UTC)
	weekEnd := time.Date(now.UTC().Year(), now.UTC().Month(), now.UTC().Day(), 0, 0, 0, 0, time.UTC)
	weekEnd = weekEnd.AddDate(0, 0, -((int(weekEnd.Weekday()) + 6) % 7))
	weekStart := weekEnd.AddDate(0, 0, -7)

	_, err := s.Pool.Exec(ctx, `
		INSERT INTO notification_deliveries(id,project_id,notification_type,dedupe_key,recipients,payload)
		SELECT 'mail_'||replace(gen_random_uuid()::text,'-',''),settings.project_id,'daily_stats',$1,target.recipients,jsonb_build_object('from',$2::timestamptz,'to',$3::timestamptz)
		FROM notification_settings settings
		CROSS JOIN LATERAL (SELECT CASE WHEN cardinality(settings.recipients)>0 THEN settings.recipients ELSE ARRAY(
			SELECT email FROM console_users users WHERE users.active AND (users.all_projects OR EXISTS(SELECT 1 FROM console_user_projects access WHERE access.user_id=users.id AND access.project_id=settings.project_id)) ORDER BY email
		) END recipients) target
		WHERE settings.daily_stats AND cardinality(target.recipients)>0
		ON CONFLICT(project_id,notification_type,dedupe_key) DO NOTHING`, dailyStart.Format("2006-01-02"), dailyStart, dailyStart.AddDate(0, 0, 1))
	if err != nil {
		return err
	}

	_, err = s.Pool.Exec(ctx, `
		INSERT INTO notification_deliveries(id,project_id,notification_type,dedupe_key,recipients,payload)
		SELECT 'mail_'||replace(gen_random_uuid()::text,'-',''),settings.project_id,'weekly_stats',$1,target.recipients,jsonb_build_object('from',$2::timestamptz,'to',$3::timestamptz)
		FROM notification_settings settings
		CROSS JOIN LATERAL (SELECT CASE WHEN cardinality(settings.recipients)>0 THEN settings.recipients ELSE ARRAY(
			SELECT email FROM console_users users WHERE users.active AND (users.all_projects OR EXISTS(SELECT 1 FROM console_user_projects access WHERE access.user_id=users.id AND access.project_id=settings.project_id)) ORDER BY email
		) END recipients) target
		WHERE settings.weekly_stats AND cardinality(target.recipients)>0
		ON CONFLICT(project_id,notification_type,dedupe_key) DO NOTHING`, weekStart.Format("2006-01-02"), weekStart, weekEnd)

	return err
}

CREATE TABLE console_user_invitations (
 id text PRIMARY KEY,
 user_id text NOT NULL REFERENCES console_users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX console_user_invitations_expiry ON console_user_invitations(expires_at) WHERE accepted_at IS NULL;

ALTER TABLE notification_deliveries ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE notification_deliveries DROP CONSTRAINT notification_deliveries_notification_type_check;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_notification_type_check CHECK(notification_type IN ('whatsapp_disconnected','customer_needs_attention','daily_stats','weekly_stats','user_invitation'));
ALTER TABLE notification_deliveries DROP CONSTRAINT notification_deliveries_project_id_notification_type_dedupe_key_key;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_dedupe UNIQUE NULLS NOT DISTINCT(project_id,notification_type,dedupe_key);

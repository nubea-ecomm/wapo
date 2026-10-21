ALTER TABLE console_users
 ADD COLUMN email_verified boolean NOT NULL DEFAULT true,
 ADD COLUMN confirm_selector text NOT NULL DEFAULT '',
 ADD COLUMN confirm_verifier text NOT NULL DEFAULT '',
 ADD COLUMN confirm_expires_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN recover_selector text NOT NULL DEFAULT '',
 ADD COLUMN recover_verifier text NOT NULL DEFAULT '',
 ADD COLUMN recover_expires_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX console_users_confirm_selector ON console_users(confirm_selector) WHERE confirm_selector<>'';
CREATE UNIQUE INDEX console_users_recover_selector ON console_users(recover_selector) WHERE recover_selector<>'';
ALTER TABLE console_sessions ADD COLUMN id text NOT NULL DEFAULT gen_random_uuid()::text;
CREATE UNIQUE INDEX console_sessions_id ON console_sessions(id);

ALTER TABLE console_user_projects ADD COLUMN role text NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member','viewer','billing'));
UPDATE console_user_projects membership SET role=users.role FROM console_users users WHERE users.id=membership.user_id;

CREATE TABLE project_invitations (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 email text NOT NULL,
 role text NOT NULL CHECK(role IN ('admin','member','viewer','billing')),
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notification_deliveries DROP CONSTRAINT notification_deliveries_notification_type_check;
ALTER TABLE notification_deliveries ADD CONSTRAINT notification_deliveries_notification_type_check CHECK(notification_type IN ('whatsapp_disconnected','customer_needs_attention','daily_stats','weekly_stats','user_invitation','auth_mail','project_invitation'));

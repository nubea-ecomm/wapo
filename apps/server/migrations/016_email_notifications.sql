CREATE TABLE notification_settings (
 project_id text PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 recipients text[] NOT NULL DEFAULT '{}',
 whatsapp_disconnected boolean NOT NULL DEFAULT true,
 customer_needs_attention boolean NOT NULL DEFAULT true,
 daily_stats boolean NOT NULL DEFAULT false,
 weekly_stats boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_deliveries (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 notification_type text NOT NULL CHECK(notification_type IN ('whatsapp_disconnected','customer_needs_attention','daily_stats','weekly_stats')),
 dedupe_key text NOT NULL,
 recipients text[] NOT NULL,
 payload jsonb NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','sent','failed')),
 attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 last_error text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,notification_type,dedupe_key)
);
CREATE INDEX notification_deliveries_pending ON notification_deliveries(available_at,created_at) WHERE state IN ('pending','processing');

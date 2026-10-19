CREATE TABLE template_states (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 business_account_id text NOT NULL,
 template_id text NOT NULL,
 data jsonb NOT NULL,
 revision bigint NOT NULL DEFAULT 1,
 observed_at timestamptz NOT NULL DEFAULT now(),
 provider_event_at bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(project_id,business_account_id,template_id)
);
CREATE TABLE template_sync_accounts (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 business_account_id text NOT NULL,
 next_sync_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 failures integer NOT NULL DEFAULT 0,
 last_success_at timestamptz,
 last_error text,
 PRIMARY KEY(project_id,business_account_id)
);
CREATE INDEX template_sync_due ON template_sync_accounts(next_sync_at);
CREATE INDEX template_history_lookup ON events(project_id,(payload->>'business_account_id'),(payload->'data'->'template'->>'id'),created_at DESC) WHERE name LIKE 'whatsapp.template.%';

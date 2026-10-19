CREATE TABLE IF NOT EXISTS projects (
 id text PRIMARY KEY, name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS api_keys (
 hash text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS resources (
 project_id text NOT NULL REFERENCES projects(id), kind text NOT NULL, id text NOT NULL,
 data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,kind,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_external_id ON resources(project_id,(data->>'external_customer_id'))
 WHERE kind='customers' AND data->>'external_customer_id' IS NOT NULL;
CREATE INDEX IF NOT EXISTS resource_lookup ON resources(project_id,kind,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS message_lookup ON resources(project_id,(data->>'connection_id'),created_at DESC) WHERE kind='messages';
CREATE TABLE IF NOT EXISTS requests (
 project_id text NOT NULL REFERENCES projects(id), key text NOT NULL, fingerprint text NOT NULL,
 state text NOT NULL CHECK(state IN ('pending','complete')), status integer, response jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(project_id,key)
);
CREATE TABLE IF NOT EXISTS events (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id), source_key text NOT NULL,
 name text NOT NULL, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(project_id,source_key)
);
CREATE TABLE IF NOT EXISTS deliveries (
 id text PRIMARY KEY, project_id text NOT NULL REFERENCES projects(id), event_id text NOT NULL REFERENCES events(id),
 subscription_id text NOT NULL, state text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), last_status integer, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_id,subscription_id)
);
CREATE INDEX IF NOT EXISTS pending_deliveries ON deliveries(available_at) WHERE state IN ('pending','processing');

CREATE UNIQUE INDEX IF NOT EXISTS connection_external_id ON resources(project_id,(data->>'external_id')) WHERE kind='connections' AND data->>'channel'='whatsapp';

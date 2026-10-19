CREATE TABLE admin_audit_logs (
 id text PRIMARY KEY,
 request_id text NOT NULL,
 actor_type text NOT NULL CHECK(actor_type IN ('user','technical')),
 actor_id text NOT NULL,
 method text NOT NULL,
 path text NOT NULL,
 target_project text NOT NULL DEFAULT '',
 status integer NOT NULL,
 duration_ms double precision NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_logs_time ON admin_audit_logs(created_at DESC,id DESC);
CREATE INDEX console_sessions_expired ON console_sessions(expires_at);
CREATE INDEX requests_retention ON requests(state,created_at);
CREATE INDEX deliveries_retention ON deliveries(state,updated_at);
CREATE TABLE rate_limit_counters (
 scope text NOT NULL,
 key_hash text NOT NULL,
 window_start timestamptz NOT NULL,
 count integer NOT NULL,
 PRIMARY KEY(scope,key_hash,window_start)
);
CREATE INDEX rate_limit_counters_expiry ON rate_limit_counters(window_start);

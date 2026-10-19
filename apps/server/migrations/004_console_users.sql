CREATE TABLE IF NOT EXISTS console_users (
 id text PRIMARY KEY,
 email text NOT NULL UNIQUE,
 name text NOT NULL,
 password_hash text NOT NULL,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS console_sessions (
 hash text PRIMARY KEY,
 user_id text NOT NULL REFERENCES console_users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS console_session_expiry ON console_sessions(expires_at);

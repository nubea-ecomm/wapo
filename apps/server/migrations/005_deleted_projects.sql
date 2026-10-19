-- Remember explicit deletions so environment bootstrap does not recreate tenants on restart.
CREATE TABLE IF NOT EXISTS deleted_projects (
 id text PRIMARY KEY,
 deleted_at timestamptz NOT NULL DEFAULT now()
);

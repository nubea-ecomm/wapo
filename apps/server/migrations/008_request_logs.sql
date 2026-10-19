CREATE TABLE request_logs (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 request_id text NOT NULL,
 method text NOT NULL,
 path text NOT NULL,
 status integer NOT NULL,
 duration_ms double precision NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_logs_project_time ON request_logs(project_id,created_at DESC,id DESC);
CREATE INDEX events_project_time ON events(project_id,created_at DESC,id DESC);
ALTER TABLE deliveries ADD COLUMN updated_at timestamptz;
UPDATE deliveries SET updated_at=created_at;
ALTER TABLE deliveries ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE deliveries ALTER COLUMN updated_at SET NOT NULL;
CREATE FUNCTION touch_delivery_time() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END;
$$;
CREATE TRIGGER delivery_updated_time BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION touch_delivery_time();
CREATE INDEX deliveries_project_updated ON deliveries(project_id,updated_at DESC,id DESC);

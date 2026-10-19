CREATE TABLE customers (
 project_id text NOT NULL REFERENCES projects(id),
 id text NOT NULL,
 name text NOT NULL CHECK (btrim(name) <> ''),
 external_customer_id text,
 email text,
 metadata jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id),
 UNIQUE(project_id,external_customer_id)
);

INSERT INTO customers(project_id,id,name,external_customer_id,email,metadata,created_at)
SELECT project_id,id,data->>'name',nullif(data->>'external_customer_id',''),
 nullif(data->>'email',''),data->'metadata',created_at
FROM resources
WHERE kind='customers';

CREATE INDEX customers_created_lookup ON customers(project_id,created_at DESC,id DESC);

-- Instance-level verification: no project exists or needs to be selected when
-- the operator registers the shared Meta app callback.
CREATE TABLE meta_webhook_verifications (
 app_id text NOT NULL,
 callback_url text NOT NULL,
 token_hash text NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(app_id,callback_url)
);

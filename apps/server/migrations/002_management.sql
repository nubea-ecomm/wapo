ALTER TABLE projects ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS id text;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'API key';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS prefix text NOT NULL DEFAULT '';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
UPDATE api_keys SET id='key_'||substr(hash,1,24) WHERE id IS NULL;
ALTER TABLE api_keys ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS api_key_id ON api_keys(id);
CREATE INDEX IF NOT EXISTS conversation_messages ON resources(project_id,(data->>'conversation_id'),created_at DESC) WHERE kind='messages';

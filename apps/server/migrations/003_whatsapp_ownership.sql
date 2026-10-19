-- Meta callback overrides are WABA-scoped. A WABA must belong to one tenant,
-- even when that tenant connects several numbers from the same account.
CREATE TABLE IF NOT EXISTS whatsapp_accounts (
 id text PRIMARY KEY,
 project_id text NOT NULL REFERENCES projects(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_phone_owner ON resources((data->>'external_id'))
 WHERE kind='connections' AND data->>'channel'='whatsapp';

CREATE OR REPLACE FUNCTION claim_whatsapp_account() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner text;
BEGIN
 IF NEW.kind='connections' AND NEW.data->>'channel'='whatsapp' THEN
  INSERT INTO whatsapp_accounts(id,project_id) VALUES(NEW.data->>'business_account_id',NEW.project_id)
   ON CONFLICT(id) DO NOTHING;
  SELECT project_id INTO owner FROM whatsapp_accounts WHERE id=NEW.data->>'business_account_id' FOR UPDATE;
  IF owner<>NEW.project_id THEN
   RAISE EXCEPTION 'WhatsApp business account belongs to another tenant' USING ERRCODE='23505';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS claim_whatsapp_account ON resources;
CREATE TRIGGER claim_whatsapp_account BEFORE INSERT OR UPDATE OF data ON resources
 FOR EACH ROW EXECUTE FUNCTION claim_whatsapp_account();

CREATE OR REPLACE FUNCTION release_whatsapp_account() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.kind='connections' AND OLD.data->>'channel'='whatsapp' THEN
  DELETE FROM whatsapp_accounts a WHERE a.id=OLD.data->>'business_account_id' AND a.project_id=OLD.project_id
   AND NOT EXISTS(SELECT 1 FROM resources r WHERE r.kind='connections' AND r.data->>'channel'='whatsapp'
    AND r.data->>'business_account_id'=a.id);
 END IF;
 RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS release_whatsapp_account ON resources;
CREATE TRIGGER release_whatsapp_account AFTER DELETE ON resources
 FOR EACH ROW EXECUTE FUNCTION release_whatsapp_account();

INSERT INTO whatsapp_accounts(id,project_id)
 SELECT DISTINCT data->>'business_account_id',project_id FROM resources
 WHERE kind='connections' AND data->>'channel'='whatsapp'
 ON CONFLICT(id) DO NOTHING;

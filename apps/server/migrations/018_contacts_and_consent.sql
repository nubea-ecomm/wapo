CREATE TABLE contacts (
 project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 id text NOT NULL,
 connection_id text NOT NULL,
 customer_id text NOT NULL DEFAULT '',
 wa_id text NOT NULL,
 phone_number text NOT NULL,
 business_scoped_user_id text NOT NULL DEFAULT '',
 parent_business_scoped_user_id text NOT NULL DEFAULT '',
 username text NOT NULL DEFAULT '',
 profile_name text NOT NULL DEFAULT '',
 display_name text NOT NULL DEFAULT '',
 display_name_custom boolean NOT NULL DEFAULT false,
 email text NOT NULL DEFAULT '',
 properties jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,id),
 UNIQUE(project_id,connection_id,wa_id),
 CHECK(jsonb_typeof(properties)='object')
);
CREATE INDEX contacts_updated_lookup ON contacts(project_id,updated_at DESC,id DESC);
CREATE INDEX contacts_connection_lookup ON contacts(project_id,connection_id,updated_at DESC);
CREATE INDEX contacts_phone_lookup ON contacts(project_id,phone_number);

INSERT INTO contacts(project_id,id,connection_id,customer_id,wa_id,phone_number,business_scoped_user_id,parent_business_scoped_user_id,username,profile_name,display_name,display_name_custom,email,properties,created_at,updated_at)
SELECT contact.project_id,contact.id,contact.data->>'connection_id',coalesce(connection.data->>'customer_id',''),
 contact.data->>'wa_id',coalesce(nullif(contact.data->>'phone_number',''),contact.data->>'wa_id'),
 coalesce(contact.data->>'business_scoped_user_id',''),coalesce(contact.data->>'parent_business_scoped_user_id',''),coalesce(contact.data->>'username',''),
 coalesce(contact.data->>'profile_name',''),coalesce(nullif(contact.data->>'display_name',''),nullif(contact.data->>'profile_name',''),contact.data->>'username',contact.data->>'wa_id'),
 coalesce((contact.data->>'display_name_custom')::boolean,coalesce(contact.data->>'display_name','')<>'' AND contact.data->>'display_name'<>coalesce(contact.data->>'profile_name','')),
 coalesce(contact.data->>'email',''),coalesce(contact.data->'properties',contact.data->'metadata','{}'::jsonb),
 contact.created_at,coalesce(nullif(contact.data->>'updated_at','')::timestamptz,contact.created_at)
FROM resources contact
LEFT JOIN resources connection ON connection.project_id=contact.project_id AND connection.kind='connections' AND connection.id=contact.data->>'connection_id'
WHERE contact.kind='contacts' AND coalesce(contact.data->>'connection_id','')<>'' AND coalesce(contact.data->>'wa_id','')<>''
ON CONFLICT DO NOTHING;

CREATE TABLE contact_marketing_preferences (
 project_id text NOT NULL,
 contact_id text NOT NULL,
 status text NOT NULL CHECK(status IN ('stopped','resumed')),
 detail text NOT NULL DEFAULT '',
 source text NOT NULL CHECK(source IN ('meta_webhook','meta_delivery_error','meta_synchronous_error')),
 last_event_at timestamptz NOT NULL,
 sequence bigint NOT NULL DEFAULT 1 CHECK(sequence>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(project_id,contact_id),
 FOREIGN KEY(project_id,contact_id) REFERENCES contacts(project_id,id) ON DELETE CASCADE
);
CREATE INDEX contact_marketing_status ON contact_marketing_preferences(project_id,status,updated_at DESC);

-- Old application images still write contact resources. Mirror those writes into
-- the typed table during rolling deploys and rollback.
CREATE FUNCTION sync_contact_resource() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE linked_customer text;
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.kind='contacts' THEN
   DELETE FROM contacts WHERE project_id=OLD.project_id AND id=OLD.id;
  ELSIF OLD.kind='connections' THEN
   DELETE FROM resources WHERE project_id=OLD.project_id AND kind='contacts' AND data->>'connection_id'=OLD.id;
   DELETE FROM contacts WHERE project_id=OLD.project_id AND connection_id=OLD.id;
  END IF;
  RETURN OLD;
 END IF;

 IF TG_OP='UPDATE' AND OLD.kind='contacts'
  AND (NEW.kind<>'contacts' OR OLD.project_id<>NEW.project_id OR OLD.id<>NEW.id) THEN
  DELETE FROM contacts WHERE project_id=OLD.project_id AND id=OLD.id;
 END IF;

 IF NEW.kind='contacts' AND coalesce(NEW.data->>'connection_id','')<>'' AND coalesce(NEW.data->>'wa_id','')<>'' THEN
  SELECT coalesce(data->>'customer_id','') INTO linked_customer
  FROM resources WHERE project_id=NEW.project_id AND kind='connections' AND id=NEW.data->>'connection_id';
  INSERT INTO contacts(project_id,id,connection_id,customer_id,wa_id,phone_number,business_scoped_user_id,parent_business_scoped_user_id,username,profile_name,display_name,display_name_custom,email,properties,created_at,updated_at)
  VALUES(NEW.project_id,NEW.id,NEW.data->>'connection_id',coalesce(nullif(NEW.data->>'customer_id',''),linked_customer,''),
   NEW.data->>'wa_id',coalesce(nullif(NEW.data->>'phone_number',''),NEW.data->>'wa_id'),coalesce(NEW.data->>'business_scoped_user_id',''),
   coalesce(NEW.data->>'parent_business_scoped_user_id',''),coalesce(NEW.data->>'username',''),coalesce(NEW.data->>'profile_name',''),
   coalesce(nullif(NEW.data->>'display_name',''),nullif(NEW.data->>'profile_name',''),NEW.data->>'username',NEW.data->>'wa_id'),coalesce((NEW.data->>'display_name_custom')::boolean,false),coalesce(NEW.data->>'email',''),
   coalesce(NEW.data->'properties',NEW.data->'metadata','{}'::jsonb),NEW.created_at,
   coalesce(nullif(NEW.data->>'updated_at','')::timestamptz,now()))
  ON CONFLICT(project_id,id) DO UPDATE SET
   connection_id=EXCLUDED.connection_id,customer_id=EXCLUDED.customer_id,wa_id=EXCLUDED.wa_id,
   phone_number=EXCLUDED.phone_number,business_scoped_user_id=EXCLUDED.business_scoped_user_id,
   parent_business_scoped_user_id=EXCLUDED.parent_business_scoped_user_id,username=EXCLUDED.username,
   profile_name=EXCLUDED.profile_name,display_name=EXCLUDED.display_name,display_name_custom=EXCLUDED.display_name_custom,
   email=EXCLUDED.email,properties=EXCLUDED.properties,updated_at=EXCLUDED.updated_at;
 END IF;
 RETURN NEW;
END;
$$;

CREATE TRIGGER sync_contact_resource
AFTER INSERT OR UPDATE OR DELETE ON resources
FOR EACH ROW EXECUTE FUNCTION sync_contact_resource();

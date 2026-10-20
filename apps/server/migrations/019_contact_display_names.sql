ALTER TABLE contacts ADD COLUMN display_name_custom boolean NOT NULL DEFAULT false;

UPDATE contacts SET
 display_name=coalesce(nullif(display_name,''),nullif(profile_name,''),nullif(username,''),wa_id),
 display_name_custom=coalesce(display_name,'')<>''
  AND display_name<>coalesce(nullif(profile_name,''),nullif(username,''),wa_id);

CREATE OR REPLACE FUNCTION sync_contact_resource() RETURNS trigger LANGUAGE plpgsql AS $$
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
   coalesce(nullif(NEW.data->>'display_name',''),nullif(NEW.data->>'profile_name',''),NEW.data->>'username',NEW.data->>'wa_id'),
   coalesce((NEW.data->>'display_name_custom')::boolean,false),coalesce(NEW.data->>'email',''),
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

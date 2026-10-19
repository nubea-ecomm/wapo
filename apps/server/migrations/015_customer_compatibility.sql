ALTER TABLE customers DROP CONSTRAINT customers_project_id_fkey;
ALTER TABLE customers ADD CONSTRAINT customers_project_id_fkey
 FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE;

-- Keep old application images safe during rolling deploys and rollback. New
-- images read the typed table, while old images still write customer resources.
CREATE FUNCTION sync_customer_resource() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  IF OLD.kind='customers' THEN
   DELETE FROM customers WHERE project_id=OLD.project_id AND id=OLD.id;
  END IF;
  RETURN OLD;
 END IF;

 IF TG_OP='UPDATE' AND OLD.kind='customers'
  AND (NEW.kind<>'customers' OR OLD.project_id<>NEW.project_id OR OLD.id<>NEW.id) THEN
  DELETE FROM customers WHERE project_id=OLD.project_id AND id=OLD.id;
 END IF;

 IF NEW.kind='customers' THEN
  INSERT INTO customers(project_id,id,name,external_customer_id,email,metadata,created_at)
  VALUES(NEW.project_id,NEW.id,NEW.data->>'name',nullif(NEW.data->>'external_customer_id',''),
   nullif(NEW.data->>'email',''),NEW.data->'metadata',NEW.created_at)
  ON CONFLICT(project_id,id) DO UPDATE SET
   name=EXCLUDED.name,
   external_customer_id=EXCLUDED.external_customer_id,
   email=EXCLUDED.email,
   metadata=EXCLUDED.metadata;
 END IF;

 RETURN NEW;
END;
$$;

CREATE TRIGGER sync_customer_resource
AFTER INSERT OR UPDATE OR DELETE ON resources
FOR EACH ROW EXECUTE FUNCTION sync_customer_resource();

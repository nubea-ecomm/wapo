package api

import (
	"context"
	"testing"

	"wapo.local/server/internal/store"
)

func TestCustomersUseTypedStorageAndRollbackMirror(t *testing.T) {
	server, _, project, _ := fixture(t)
	ctx := context.Background()
	id := store.ID("cus")
	object := store.Object{"id": id, "name": "Typed merchant", "external_customer_id": "merchant-typed", "metadata": store.Object{"tier": "test"}}

	if err := server.Store.Put(ctx, project, "customers", id, object, true); err != nil {
		t.Fatal(err)
	}

	var typedName, mirroredName string

	if err := server.Store.Pool.QueryRow(ctx, "SELECT name FROM customers WHERE project_id=$1 AND id=$2", project, id).Scan(&typedName); err != nil {
		t.Fatal(err)
	}

	if err := server.Store.Pool.QueryRow(ctx, "SELECT data->>'name' FROM resources WHERE project_id=$1 AND kind='customers' AND id=$2", project, id).Scan(&mirroredName); err != nil {
		t.Fatal(err)
	}

	if typedName != "Typed merchant" || mirroredName != typedName {
		t.Fatalf("typed and compatibility records diverged: %q / %q", typedName, mirroredName)
	}

	if _, err := server.Store.Get(ctx, "another-project", "customers", id); err != store.ErrNotFound {
		t.Fatalf("cross-project customer read returned %v", err)
	}
}

func TestLegacyCustomerWritesStayVisibleToTypedReaders(t *testing.T) {
	server, _, project, _ := fixture(t)
	ctx := context.Background()
	id := store.ID("cus")

	_, err := server.Store.Pool.Exec(ctx, `INSERT INTO resources(project_id,kind,id,data)
		VALUES($1,'customers',$2,jsonb_build_object('id',$2::text,'name','Legacy merchant'))`, project, id)
	if err != nil {
		t.Fatal(err)
	}

	customer, err := server.Store.Get(ctx, project, "customers", id)
	if err != nil || customer["name"] != "Legacy merchant" {
		t.Fatalf("legacy insert was not synchronized: %v %v", customer, err)
	}

	if _, err = server.Store.Pool.Exec(ctx, `UPDATE resources SET data=data||'{"name":"Updated legacy merchant"}'::jsonb
		WHERE project_id=$1 AND kind='customers' AND id=$2`, project, id); err != nil {
		t.Fatal(err)
	}

	customer, err = server.Store.Get(ctx, project, "customers", id)
	if err != nil || customer["name"] != "Updated legacy merchant" {
		t.Fatalf("legacy update was not synchronized: %v %v", customer, err)
	}

	if _, err = server.Store.Pool.Exec(ctx, "DELETE FROM resources WHERE project_id=$1 AND kind='customers' AND id=$2", project, id); err != nil {
		t.Fatal(err)
	}

	if _, err = server.Store.Get(ctx, project, "customers", id); err != store.ErrNotFound {
		t.Fatalf("legacy delete left typed customer behind: %v", err)
	}
}

func TestLegacyProjectDeletionRemainsCompatible(t *testing.T) {
	server, _, _, _ := fixture(t)
	ctx := context.Background()
	project := store.ID("legacy_project")
	id := store.ID("cus")

	if _, err := server.Store.Pool.Exec(ctx, "INSERT INTO projects(id,name) VALUES($1,'Legacy project')", project); err != nil {
		t.Fatal(err)
	}

	if _, err := server.Store.Pool.Exec(ctx, `INSERT INTO resources(project_id,kind,id,data)
		VALUES($1,'customers',$2,jsonb_build_object('id',$2::text,'name','Legacy merchant'))`, project, id); err != nil {
		t.Fatal(err)
	}

	// This is the deletion order used by application images from before typed
	// customers existed. The compatibility trigger must not leave an FK blocker.
	if _, err := server.Store.Pool.Exec(ctx, "DELETE FROM resources WHERE project_id=$1", project); err != nil {
		t.Fatal(err)
	}

	if _, err := server.Store.Pool.Exec(ctx, "DELETE FROM projects WHERE id=$1", project); err != nil {
		t.Fatal(err)
	}
}

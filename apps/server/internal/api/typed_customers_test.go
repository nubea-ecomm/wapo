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

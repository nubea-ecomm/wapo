package api

import (
	"bytes"
	"context"
	"os"
	"testing"

	"wapo.local/server/internal/store"
)

func TestEncryptionKeyRotationPersistsUsableCredentials(t *testing.T) {
	server, _, project, _ := fixture(t)
	ctx := context.Background()
	id := store.ID("con")

	if err := server.Store.Put(ctx, project, "connections", id, store.Object{
		"id": id, "channel": "whatsapp", "status": "connected",
		"external_id": "rotation-phone", "business_account_id": "rotation-account",
		"access_token": server.Store.Seal("provider-secret", project),
	}, true); err != nil {
		t.Fatal(err)
	}

	newKey := bytes.Repeat([]byte{9}, 32)
	rotated, err := server.Store.RotateEncryptionKey(ctx, newKey)

	if err != nil || rotated < 1 {
		t.Fatalf("rotation failed: count=%d error=%v", rotated, err)
	}

	rotatedStore, err := store.Open(ctx, os.Getenv("TEST_DATABASE_URL"), newKey)
	if err != nil {
		t.Fatal(err)
	}
	defer rotatedStore.Pool.Close()

	connection, err := rotatedStore.Get(ctx, project, "connections", id)
	if err != nil {
		t.Fatal(err)
	}

	plain, err := rotatedStore.Unseal(connection["access_token"].(string), project)
	if err != nil || plain != "provider-secret" {
		t.Fatalf("rotated credential is unusable: %q %v", plain, err)
	}
}

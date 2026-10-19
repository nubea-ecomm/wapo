package api

import (
	"bytes"
	"context"
	"encoding/json"
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

	invitationID := store.ID("invitation")
	deliveryID := store.ID("mail")
	payload, _ := json.Marshal(store.Object{"invitation_id": invitationID, "invitation_token": server.Store.Seal("invitation-secret", invitationID)})

	if _, err := server.Store.Pool.Exec(ctx, "INSERT INTO notification_deliveries(id,project_id,notification_type,dedupe_key,recipients,payload) VALUES($1,NULL,'user_invitation',$2,$3,$4)", deliveryID, invitationID, []string{"invitee@example.com"}, payload); err != nil {
		t.Fatal(err)
	}

	t.Cleanup(func() { server.Store.Pool.Exec(ctx, "DELETE FROM notification_deliveries WHERE id=$1", deliveryID) })

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

	var rotatedPayload []byte

	if err = rotatedStore.Pool.QueryRow(ctx, "SELECT payload FROM notification_deliveries WHERE id=$1", deliveryID).Scan(&rotatedPayload); err != nil {
		t.Fatal(err)
	}

	var invitation store.Object

	if err = json.Unmarshal(rotatedPayload, &invitation); err != nil {
		t.Fatal(err)
	}

	plain, err = rotatedStore.Unseal(invitation["invitation_token"].(string), invitationID)
	if err != nil || plain != "invitation-secret" {
		t.Fatalf("rotated invitation token is unusable: %q %v", plain, err)
	}
}

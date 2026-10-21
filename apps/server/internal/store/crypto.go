package store

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
)

func ID(prefix string) string {
	b := make([]byte, 16)
	if _, e := rand.Read(b); e != nil {
		panic(e)
	}

	return prefix + "_" + hex.EncodeToString(b)
}
func Hash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func (s *Store) Seal(plain, scope string) string {
	n := make([]byte, s.aead.NonceSize())
	if _, e := rand.Read(n); e != nil {
		panic(e)
	}

	return base64.StdEncoding.EncodeToString(s.aead.Seal(n, n, []byte(plain), []byte(scope)))
}

func (s *Store) Unseal(value, scope string) (string, error) {
	b, e := base64.StdEncoding.DecodeString(value)
	if e != nil || len(b) < s.aead.NonceSize() {
		return "", fmt.Errorf("invalid encrypted secret")
	}

	n := s.aead.NonceSize()
	p, e := s.aead.Open(nil, b[:n], b[n:], []byte(scope))

	return string(p), e
}

// RotateEncryptionKey re-encrypts every persisted credential atomically. The
// caller must stop API and worker processes while running the rotation command.
func (s *Store) RotateEncryptionKey(ctx context.Context, key []byte) (int, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return 0, err
	}

	next, err := cipher.NewGCM(block)
	if err != nil {
		return 0, err
	}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `SELECT project_id,kind,id,data FROM resources WHERE
		(kind='connections' AND data ?| ARRAY['access_token','registration_pin']) OR
		(kind='webhooks' AND data ? 'secret_key') OR
		(kind='setup_links' AND data ? 'onboarding_token') FOR UPDATE`)
	if err != nil {
		return 0, err
	}

	type credentialResource struct {
		project, kind, id string
		data              Object
	}

	resources := []credentialResource{}

	for rows.Next() {
		var resource credentialResource

		if err = rows.Scan(&resource.project, &resource.kind, &resource.id, &resource.data); err != nil {
			rows.Close()
			return 0, err
		}

		resources = append(resources, resource)
	}

	if err = rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}

	rows.Close()

	for _, resource := range resources {
		if err = rotateCredentialObject(s.aead, next, resource.project, resource.kind, resource.data); err != nil {
			return 0, fmt.Errorf("rotate %s/%s: %w", resource.kind, resource.id, err)
		}

		if _, err = tx.Exec(ctx, "UPDATE resources SET data=$1 WHERE project_id=$2 AND kind=$3 AND id=$4", resource.data, resource.project, resource.kind, resource.id); err != nil {
			return 0, err
		}
	}

	invitationRows, err := tx.Query(ctx, "SELECT id,payload FROM notification_deliveries WHERE payload ? 'invitation_token' FOR UPDATE")
	if err != nil {
		return 0, err
	}

	type invitationSecret struct {
		id      string
		payload Object
	}

	invitations := []invitationSecret{}

	for invitationRows.Next() {
		var invitation invitationSecret

		if err = invitationRows.Scan(&invitation.id, &invitation.payload); err != nil {
			invitationRows.Close()
			return 0, err
		}

		invitations = append(invitations, invitation)
	}

	if err = invitationRows.Err(); err != nil {
		invitationRows.Close()
		return 0, err
	}

	invitationRows.Close()

	for _, invitation := range invitations {
		invitationID, _ := invitation.payload["invitation_id"].(string)
		ciphertext, _ := invitation.payload["invitation_token"].(string)
		plain, decryptErr := unsealWith(s.aead, ciphertext, invitationID)

		if decryptErr != nil || invitationID == "" {
			return 0, fmt.Errorf("rotate invitation %s: unreadable token", invitation.id)
		}

		invitation.payload["invitation_token"] = sealWith(next, plain, invitationID)
		if _, err = tx.Exec(ctx, "UPDATE notification_deliveries SET payload=$2 WHERE id=$1", invitation.id, invitation.payload); err != nil {
			return 0, err
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}

	return len(resources) + len(invitations), nil
}

func rotateCredentialObject(current, next cipher.AEAD, scope, kind string, object Object) error {
	fields := map[string][]string{
		"connections": {"access_token", "registration_pin"},
		"webhooks":    {"secret_key"},
		"setup_links": {"onboarding_token"},
	}[kind]

	for _, field := range fields {
		value, ok := object[field].(string)
		if !ok || value == "" {
			continue
		}

		plain, err := unsealWith(current, value, scope)
		if err != nil {
			return fmt.Errorf("%s: %w", field, err)
		}

		object[field] = sealWith(next, plain, scope)
	}

	return nil
}

func sealWith(aead cipher.AEAD, plain, scope string) string {
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		panic(err)
	}

	return base64.StdEncoding.EncodeToString(aead.Seal(nonce, nonce, []byte(plain), []byte(scope)))
}

func unsealWith(aead cipher.AEAD, value, scope string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(raw) < aead.NonceSize() {
		return "", fmt.Errorf("invalid encrypted secret")
	}

	nonceSize := aead.NonceSize()
	plain, err := aead.Open(nil, raw[:nonceSize], raw[nonceSize:], []byte(scope))

	return string(plain), err
}

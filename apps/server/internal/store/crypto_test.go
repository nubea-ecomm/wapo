package store

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"testing"
)

func TestSecretsAreRandomizedAndBoundToTenant(t *testing.T) {
	block, _ := aes.NewCipher(bytes.Repeat([]byte{3}, 32))
	a, _ := cipher.NewGCM(block)
	s := &Store{aead: a}
	first := s.Seal("token", "tenant-a")
	second := s.Seal("token", "tenant-a")

	if first == second || first == "token" {
		t.Fatal("encryption is deterministic or plaintext")
	}

	plain, e := s.Unseal(first, "tenant-a")
	if e != nil || plain != "token" {
		t.Fatal("cannot decrypt")
	}

	if _, e = s.Unseal(first, "tenant-b"); e == nil {
		t.Fatal("cross-tenant decryption accepted")
	}

	if _, e = s.Unseal("bad", "tenant-a"); e == nil {
		t.Fatal("malformed ciphertext accepted")
	}
}

func TestCredentialObjectRotation(t *testing.T) {
	oldBlock, _ := aes.NewCipher(bytes.Repeat([]byte{3}, 32))
	oldAEAD, _ := cipher.NewGCM(oldBlock)
	newBlock, _ := aes.NewCipher(bytes.Repeat([]byte{4}, 32))
	newAEAD, _ := cipher.NewGCM(newBlock)
	object := Object{
		"access_token":     sealWith(oldAEAD, "provider-token", "tenant-a"),
		"registration_pin": sealWith(oldAEAD, "123456", "tenant-a"),
		"name":             "Connection",
	}

	if err := rotateCredentialObject(oldAEAD, newAEAD, "tenant-a", "connections", object); err != nil {
		t.Fatal(err)
	}

	for field, expected := range map[string]string{"access_token": "provider-token", "registration_pin": "123456"} {
		plain, err := unsealWith(newAEAD, object[field].(string), "tenant-a")
		if err != nil || plain != expected {
			t.Fatalf("%s was not rotated", field)
		}

		if _, err = unsealWith(oldAEAD, object[field].(string), "tenant-a"); err == nil {
			t.Fatalf("%s still decrypts with old key", field)
		}
	}

	if object["name"] != "Connection" {
		t.Fatal("rotation modified a non-secret field")
	}
}

func TestConversationIdentityIncludesConnectionAndExactContact(t *testing.T) {
	if ConversationID("a", "visitor") != ConversationID("a", "visitor") {
		t.Fatal("unstable ID")
	}

	if ConversationID("a", "visitor") == ConversationID("b", "visitor") {
		t.Fatal("cross-channel conversation collision")
	}

	if ConversationID("a", "bc") == ConversationID("ab", "c") {
		t.Fatal("ambiguous concatenation")
	}
}

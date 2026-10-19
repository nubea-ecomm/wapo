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

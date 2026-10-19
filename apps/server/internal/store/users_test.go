package store

import (
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestPasswordsAreHashedAndLengthBounded(t *testing.T) {
	hash, e := PasswordHash("a-strong-local-password")
	if e != nil || hash == "a-strong-local-password" {
		t.Fatal("password not hashed")
	}

	if bcrypt.CompareHashAndPassword([]byte(hash), []byte("a-strong-local-password")) != nil {
		t.Fatal("hash cannot verify password")
	}

	if bcrypt.CompareHashAndPassword([]byte(hash), []byte("incorrect")) == nil {
		t.Fatal("wrong password accepted")
	}

	if _, e = PasswordHash("short"); e == nil {
		t.Fatal("short password accepted")
	}
}

func TestEmailNormalization(t *testing.T) {
	email, e := NormalizeEmail(" ADMIN@Example.com ")
	if e != nil || email != "admin@example.com" {
		t.Fatal("email normalization failed")
	}

	for _, value := range []string{"invalid", "Name <admin@example.com>", ""} {
		if _, e = NormalizeEmail(value); e == nil {
			t.Fatal("invalid email accepted")
		}
	}
}

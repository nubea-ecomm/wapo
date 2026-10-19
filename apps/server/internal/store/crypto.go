package store

import (
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

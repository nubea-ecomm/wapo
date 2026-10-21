package api

import (
	"crypto/subtle"
	"net/http"
	"strings"

	"wapo.local/server/internal/store"
)

func credential(r *http.Request) string {
	if key := r.Header.Get("X-API-Key"); key != "" {
		return key
	}

	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}

func (s *Server) isTechnicalOperator(key string) bool {
	return s.isTechnicalOperatorHash(store.Hash(key))
}

func (s *Server) isTechnicalOperatorHash(hash string) bool {
	configuredHash := s.adminKeyHash
	if configuredHash == "" && s.Config.AdminKey != "" {
		configuredHash = store.Hash(s.Config.AdminKey)
	}

	return configuredHash != "" && subtle.ConstantTimeCompare([]byte(hash), []byte(configuredHash)) == 1
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	_, e := s.Store.Pool.Exec(r.Context(), "DELETE FROM console_sessions WHERE hash=$1", store.Hash(credential(r)))
	if e != nil {
		dbError(w, e)
		return
	}

	write(w, 200, store.Object{"data": store.Object{"signed_out": true}})
}

func (s *Server) consoleProfile(w http.ResponseWriter, r *http.Request) {
	user, e := s.Store.AuthenticateSession(r.Context(), credential(r))
	if e != nil {
		fail(w, 401, "unauthorized", "Sign-in required")
		return
	}

	w.Header().Set("Cache-Control", "no-store")
	write(w, 200, store.Object{"data": store.Object{"user": user}})
}

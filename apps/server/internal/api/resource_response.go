package api

import (
	"encoding/json"
	"fmt"
	"net/http"

	"wapo.local/server/internal/store"
)

func (s *Server) getOnly(w http.ResponseWriter, r *http.Request, kind, id string) {
	if r.Method != "GET" || id == "" {
		fail(w, 405, "method_not_allowed", "Use GET with a resource ID")
		return
	}
	o, e := s.Store.Get(r.Context(), project(r), kind, id)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, store.Object{"data": clean(o)})
}
func numeric(v string) bool {
	if v == "" {
		return false
	}
	for _, c := range v {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}
func rawJSON(w http.ResponseWriter, status int, b []byte) {
	if !json.Valid(b) {
		fail(w, 502, "provider_error", fmt.Sprintf("Provider returned non-JSON response (HTTP %d)", status))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(b)
}

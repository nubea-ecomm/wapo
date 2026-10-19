package api

import (
	"encoding/json"
	"net/http"

	"wapo.local/server/internal/store"
)

func pageLimit(r *http.Request) int { // Compatibility consumers request at most 100 records.
	v := r.URL.Query().Get("limit")
	if v == "" {
		return 100
	}
	var n int
	if json.Unmarshal([]byte(v), &n) == nil && n > 0 && n <= 100 {
		return n
	}
	return 100
}
func phone(c store.Object) store.Object {
	return store.Object{"id": c["external_id"], "customer_id": c["customer_id"], "business_account_id": c["business_account_id"], "display_phone_number": c["display_phone_number"], "status": c["status"], "quality_rating": c["quality_rating"], "inbound_processing_enabled": c["inbound_processing_enabled"]}
}
func (s *Server) phoneConnection(r *http.Request, id string) (store.Object, error) {
	rows, _, e := s.Store.List(r.Context(), project(r), "connections", map[string]string{"channel": "whatsapp", "external_id": id}, "", 1)
	if e != nil {
		return nil, e
	}
	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}
	return rows[0], nil
}

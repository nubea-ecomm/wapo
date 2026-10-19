package api

import (
	"encoding/json"
	"net/http"
	"wapo.local/server/internal/store"
)

func (s *Server) templateHistory(w http.ResponseWriter, r *http.Request, connection, id string) {
	if r.Method != "GET" {
		fail(w, 405, "method_not_allowed", "Use GET")
		return
	}
	c, e := s.Store.Get(r.Context(), project(r), "connections", connection)
	if e != nil {
		dbError(w, e)
		return
	}
	rows, e := s.Store.Pool.Query(r.Context(), `SELECT id,name,payload,created_at FROM events WHERE project_id=$1 AND name LIKE 'whatsapp.template.%' AND payload->>'business_account_id'=$2 AND payload->'data'->'template'->>'id'=$3 ORDER BY created_at DESC,id DESC LIMIT 100`, project(r), str(c, "business_account_id"), id)
	if e != nil {
		dbError(w, e)
		return
	}
	defer rows.Close()
	out := []store.Object{}
	for rows.Next() {
		var id, name string
		var raw []byte
		var at any
		if e = rows.Scan(&id, &name, &raw, &at); e != nil {
			dbError(w, e)
			return
		}
		var payload store.Object
		if e = json.Unmarshal(raw, &payload); e != nil {
			dbError(w, e)
			return
		}
		out = append(out, store.Object{"id": id, "event": name, "data": payload["data"], "created_at": at})
	}
	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}
	write(w, 200, store.Object{"data": out})
}

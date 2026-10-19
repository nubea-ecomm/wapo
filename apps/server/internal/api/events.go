package api

import (
	"encoding/json"
	"net/http"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		fail(w, 405, "method_not_allowed", "Use GET")
		return
	}

	p := project(r)
	after := r.URL.Query().Get("after")

	rows, e := s.Store.Pool.Query(r.Context(), `SELECT id,name,payload,created_at FROM events WHERE project_id=$1 AND ($2='' OR (created_at,id)<(SELECT created_at,id FROM events WHERE project_id=$1 AND id=$2)) ORDER BY created_at DESC,id DESC LIMIT 101`, p, after)
	if e != nil {
		dbError(w, e)
		return
	}
	defer rows.Close()

	out := []store.Object{}
	next := ""

	for rows.Next() {
		var (
			id, name string
			raw      []byte
			at       time.Time
		)

		if e = rows.Scan(&id, &name, &raw, &at); e != nil {
			dbError(w, e)
			return
		}

		if len(out) == 100 {
			next = str(out[len(out)-1], "id")
			break
		}

		var payload store.Object

		if e = json.Unmarshal(raw, &payload); e != nil {
			dbError(w, e)
			return
		}

		out = append(out, store.Object{"id": id, "event": name, "payload": payload, "created_at": at.UTC().Format(time.RFC3339Nano)})
	}

	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}

	write(w, 200, store.Object{"data": out, "meta": store.Object{"has_more": next != "", "after": next}})
}

package api

import (
	"net/http"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) deliveries(w http.ResponseWriter, r *http.Request, id, action string) {
	p := project(r)
	if r.Method == "POST" && id != "" && action == "retry" {
		tag, e := s.Store.Pool.Exec(r.Context(), "UPDATE deliveries SET state='pending',attempts=0,available_at=now() WHERE project_id=$1 AND id=$2 AND state='failed'", p, id)
		if e != nil {
			dbError(w, e)
			return
		}
		if tag.RowsAffected() == 0 {
			fail(w, 409, "not_retryable", "Delivery is not failed or does not belong to this project")
			return
		}
		write(w, 200, store.Object{"data": store.Object{"id": id, "state": "pending"}})
		return
	}
	if r.Method != "GET" || id != "" {
		fail(w, 405, "method_not_allowed", "Use GET, or POST /{id}/retry for a failed delivery")
		return
	}
	rows, e := s.Store.Pool.Query(r.Context(), `SELECT d.id,e.name,d.subscription_id,d.state,d.attempts,d.last_status,d.created_at FROM deliveries d JOIN events e ON e.id=d.event_id WHERE d.project_id=$1 ORDER BY d.created_at DESC LIMIT 100`, p)
	if e != nil {
		dbError(w, e)
		return
	}
	defer rows.Close()
	out := []store.Object{}
	for rows.Next() {
		var id, name, subscription, state string
		var attempts int
		var status *int
		var at time.Time
		if e = rows.Scan(&id, &name, &subscription, &state, &attempts, &status, &at); e != nil {
			dbError(w, e)
			return
		}
		out = append(out, store.Object{"id": id, "event": name, "subscription_id": subscription, "state": state, "attempts": attempts, "last_status": status, "created_at": at.UTC().Format(time.RFC3339Nano)})
	}
	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}
	write(w, 200, store.Object{"data": out})
}

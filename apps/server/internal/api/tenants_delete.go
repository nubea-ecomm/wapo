package api

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

func (s *Server) deleteTenant(w http.ResponseWriter, r *http.Request, id string) {
	tx, e := s.Store.Pool.Begin(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(r.Context())

	var project string

	e = tx.QueryRow(r.Context(), "SELECT id FROM projects WHERE id=$1 FOR UPDATE", id).Scan(&project)

	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "not_found", "Tenant not found")
		return
	}

	if e != nil {
		dbError(w, e)
		return
	}

	// Order respects foreign keys. The project lock serializes concurrent inserts referencing this tenant.
	for _, table := range []string{"deliveries", "events", "requests", "customers", "resources", "api_keys", "whatsapp_accounts"} {
		if _, e = tx.Exec(r.Context(), "DELETE FROM "+table+" WHERE project_id=$1", id); e != nil {
			dbError(w, e)
			return
		}
	}

	if _, e = tx.Exec(r.Context(), "INSERT INTO deleted_projects(id) VALUES($1) ON CONFLICT DO NOTHING", id); e != nil {
		dbError(w, e)
		return
	}

	if _, e = tx.Exec(r.Context(), "DELETE FROM projects WHERE id=$1", id); e != nil {
		dbError(w, e)
		return
	}

	if e = tx.Commit(r.Context()); e != nil {
		dbError(w, e)
		return
	}

	s.Store.InvalidateProjectAuthentication(id)

	w.WriteHeader(http.StatusNoContent)
}

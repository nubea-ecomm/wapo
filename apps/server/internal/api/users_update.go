package api

import (
	"net/http"

	"wapo.local/server/internal/store"
)

func (s *Server) updateUser(w http.ResponseWriter, r *http.Request, id string) {
	input, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}

	tx, e := s.Store.Pool.Begin(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(r.Context())

	if _, e = tx.Exec(r.Context(), "SELECT pg_advisory_xact_lock(874163903)"); e != nil {
		dbError(w, e)
		return
	}

	current, e := scanUser(tx.QueryRow(r.Context(), selectUser+" WHERE u.id=$1", id))
	if e != nil {
		dbError(w, notFound(e))
		return
	}

	access, e := parseUserAccess(input, userAccess{Role: current.Role, All: current.AllProjects, Projects: current.ProjectIDs})
	if e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}

	if e = saveUserAccess(r.Context(), tx, id, access); e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}

	if active, ok := input["active"].(bool); ok {
		if _, e = tx.Exec(r.Context(), "UPDATE console_users SET active=$2 WHERE id=$1", id, active); e != nil {
			dbError(w, e)
			return
		}
	}

	if password := str(input, "password"); password != "" {
		hash, e := store.PasswordHash(password)
		if e != nil {
			fail(w, 422, "validation_error", e.Error())
			return
		}

		if _, e = tx.Exec(r.Context(), "UPDATE console_users SET password_hash=$2 WHERE id=$1", id, hash); e != nil {
			dbError(w, e)
			return
		}

		if _, e = tx.Exec(r.Context(), "DELETE FROM console_sessions WHERE user_id=$1", id); e != nil {
			dbError(w, e)
			return
		}
	}

	var operators int

	if e = tx.QueryRow(r.Context(), "SELECT count(*) FROM console_users WHERE active AND role='admin' AND all_projects").Scan(&operators); e != nil {
		dbError(w, e)
		return
	}

	if operators == 0 {
		fail(w, 409, "last_operator", "At least one active administrator with access to all projects is required")
		return
	}

	if e = tx.Commit(r.Context()); e != nil {
		dbError(w, e)
		return
	}

	write(w, 200, store.Object{"data": store.Object{"id": id, "updated": true}})
}

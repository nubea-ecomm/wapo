package api

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"
)

func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request, id string) {
	tx, e := s.Store.Pool.Begin(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	// Share the lock with activation changes so concurrent requests cannot remove all operators.
	if _, e = tx.Exec(r.Context(), "SELECT pg_advisory_xact_lock(874163903)"); e != nil {
		dbError(w, e)
		return
	}

	var active bool

	e = tx.QueryRow(r.Context(), "SELECT active AND role='admin' AND all_projects FROM console_users WHERE id=$1", id).Scan(&active)

	if errors.Is(e, pgx.ErrNoRows) {
		fail(w, 404, "not_found", "User not found")
		return
	}

	if e != nil {
		dbError(w, e)
		return
	}

	if active {
		var others int

		if e = tx.QueryRow(r.Context(), "SELECT count(*) FROM console_users WHERE active AND role='admin' AND all_projects AND id<>$1", id).Scan(&others); e != nil {
			dbError(w, e)
			return
		}

		if others == 0 {
			fail(w, 409, "last_operator", "Cannot delete the last active administrator")
			return
		}
	}

	// Sessions are removed by the foreign key cascade; tenant resources have no user ownership dependency.
	if _, e = tx.Exec(r.Context(), "DELETE FROM notification_deliveries WHERE notification_type='user_invitation' AND payload->>'invitation_id' IN (SELECT id FROM console_user_invitations WHERE user_id=$1)", id); e != nil {
		dbError(w, e)
		return
	}

	if _, e = tx.Exec(r.Context(), "DELETE FROM console_users WHERE id=$1", id); e != nil {
		dbError(w, e)
		return
	}

	if e = tx.Commit(r.Context()); e != nil {
		dbError(w, e)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

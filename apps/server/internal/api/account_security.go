package api

import (
	"net/http"
	"time"

	"github.com/aarondl/authboss/v3"
	"wapo.local/server/internal/store"
)

func (s *Server) changeOwnPassword(w http.ResponseWriter, r *http.Request) {
	if !s.authRateLimit(w, r) {
		return
	}

	current, err := s.Store.AuthenticateSession(r.Context(), credential(r))
	if err != nil {
		fail(w, 401, "unauthorized", "Sign-in required")
		return
	}

	input, err := decode(r)
	if err != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}

	password := str(input, "password")
	if len(password) < 12 || len(password) > 72 {
		fail(w, 422, "validation_error", "password must contain between 12 and 72 bytes")
		return
	}

	tx, err := s.Store.Pool.Begin(r.Context())
	if err != nil {
		dbError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	if _, ok := lockAccountSession(w, r, tx, current.ID); !ok {
		return
	}

	storage := authStorage{tx: tx}

	user, err := storage.load(r.Context(), "id=$1", current.ID)
	if err != nil {
		dbError(w, err)
		return
	}

	ab := authboss.New()
	ab.Storage.Server = storage
	ab.Core.Hasher = authboss.NewBCryptHasher(12)

	if ab.VerifyPassword(user, str(input, "current_password")) != nil {
		fail(w, 401, "invalid_credentials", "Current password is incorrect")
		return
	}

	user.PutRecoverSelector("")
	user.PutRecoverVerifier("")

	err = ab.UpdatePassword(r.Context(), user, password)
	if err == nil {
		err = tx.Commit(r.Context())
	}

	if err != nil {
		dbError(w, err)
		return
	}

	write(w, 200, store.Object{"data": store.Object{"updated": true, "signed_out": true}})
}

func (s *Server) ownSessions(w http.ResponseWriter, r *http.Request) {
	user, err := s.Store.AuthenticateSession(r.Context(), credential(r))
	if err != nil {
		fail(w, 401, "unauthorized", "Sign-in required")
		return
	}

	w.Header().Set("Cache-Control", "no-store")

	if r.Method == "DELETE" {
		result, err := s.Store.Pool.Exec(r.Context(), "DELETE FROM console_sessions WHERE id=$1 AND user_id=$2", r.PathValue("id"), user.ID)
		if err != nil {
			dbError(w, err)
			return
		}

		if result.RowsAffected() == 0 {
			fail(w, 404, "not_found", "Session not found")
			return
		}

		write(w, 200, store.Object{"data": store.Object{"revoked": true}})

		return
	}

	rows, err := s.Store.Pool.Query(r.Context(), "SELECT id,expires_at,hash=$2 FROM console_sessions WHERE user_id=$1 AND expires_at>now() ORDER BY expires_at DESC", user.ID, store.Hash(credential(r)))
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()

	sessions := []store.Object{}

	for rows.Next() {
		var (
			id      string
			expires time.Time
			current bool
		)

		if err = rows.Scan(&id, &expires, &current); err != nil {
			dbError(w, err)
			return
		}

		sessions = append(sessions, store.Object{"id": id, "expires_at": expires, "current": current})
	}

	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}

	write(w, 200, store.Object{"data": sessions})
}

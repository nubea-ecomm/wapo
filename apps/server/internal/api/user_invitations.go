package api

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

func (s *Server) userInvitation(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	token := r.PathValue("token")
	if token == "" {
		fail(w, 404, "not_found", "Invitation not found")
		return
	}

	if r.Method == "GET" {
		var (
			name, email string
			expires     time.Time
		)

		err := s.Store.Pool.QueryRow(r.Context(), `SELECT users.name,users.email,invitations.expires_at FROM console_user_invitations invitations JOIN console_users users ON users.id=invitations.user_id WHERE invitations.token_hash=$1 AND invitations.accepted_at IS NULL AND invitations.expires_at>now()`, store.Hash(token)).Scan(&name, &email, &expires)
		if err != nil {
			invitationError(w, err)
			return
		}

		write(w, 200, store.Object{"data": store.Object{"name": name, "email": email, "expires_at": expires.UTC().Format(time.RFC3339Nano)}})

		return
	}

	if r.Method != "POST" {
		fail(w, 405, "method_not_allowed", "Use GET or POST")
		return
	}

	input, err := decode(r)
	if err != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}

	tx, err := s.Store.Pool.Begin(r.Context())
	if err != nil {
		dbError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	var invitationID, userID string

	err = tx.QueryRow(r.Context(), `SELECT id,user_id FROM console_user_invitations WHERE token_hash=$1 AND accepted_at IS NULL AND expires_at>now() FOR UPDATE`, store.Hash(token)).Scan(&invitationID, &userID)
	if err != nil {
		invitationError(w, err)
		return
	}

	hash, err := store.PasswordHash(str(input, "password"))
	if err != nil {
		fail(w, 422, "validation_error", err.Error())
		return
	}

	if _, err = tx.Exec(r.Context(), "UPDATE console_users SET password_hash=$2,active=true WHERE id=$1", userID, hash); err == nil {
		_, err = tx.Exec(r.Context(), "UPDATE console_user_invitations SET accepted_at=now() WHERE id=$1", invitationID)
	}

	if err == nil {
		_, err = tx.Exec(r.Context(), "DELETE FROM console_sessions WHERE user_id=$1", userID)
	}

	if err != nil {
		dbError(w, err)
		return
	}

	if err = tx.Commit(r.Context()); err != nil {
		dbError(w, err)
		return
	}

	write(w, 200, store.Object{"data": store.Object{"accepted": true}})
}

func invitationError(w http.ResponseWriter, err error) {
	if err == pgx.ErrNoRows {
		fail(w, 410, "invitation_unavailable", "Invitation is expired, accepted, or unknown")
		return
	}

	dbError(w, err)
}

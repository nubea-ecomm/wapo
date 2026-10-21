package api

import (
	"net/http"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

// Revalidate after acquiring locks: an email change, deactivation or session
// revocation may have committed since the request's initial authentication.
func lockAccountSession(w http.ResponseWriter, r *http.Request, tx pgx.Tx, id string) (string, bool) {
	var email, hash string

	err := tx.QueryRow(r.Context(), "SELECT email FROM console_users WHERE id=$1 AND active AND email_verified FOR UPDATE", id).Scan(&email)
	if err == nil {
		err = tx.QueryRow(r.Context(), "SELECT hash FROM console_sessions WHERE hash=$1 AND user_id=$2 AND expires_at>clock_timestamp() FOR SHARE", store.Hash(credential(r)), id).Scan(&hash)
	}

	if err == pgx.ErrNoRows {
		fail(w, 401, "unauthorized", "Sign-in required")
		return "", false
	}

	if err != nil {
		dbError(w, err)
		return "", false
	}

	return email, true
}

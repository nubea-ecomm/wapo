package api

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

// startConsoleSession issues the opaque, revocable console session returned by
// login and registration. joined describes an invitation accepted in the same
// transaction, if any.
func startConsoleSession(r *http.Request, tx pgx.Tx, userID string, joined store.Object) (int, store.Object, error) {
	token := store.ID("wapo_session")
	expires := time.Now().UTC().Add(12 * time.Hour)

	_, err := tx.Exec(r.Context(), "INSERT INTO console_sessions(hash,user_id,expires_at) VALUES($1,$2,$3)", store.Hash(token), userID, expires)
	if err != nil {
		return 0, nil, err
	}

	user, err := scanUser(tx.QueryRow(r.Context(), selectUser+" WHERE u.id=$1", userID))
	if err != nil {
		return 0, nil, err
	}

	user.ProjectRoles, err = store.LoadProjectRoles(r.Context(), tx, user.ID)
	data := store.Object{"token": token, "expires_at": expires, "user": user}

	if joined != nil {
		data["invitation"] = joined
	}

	return 200, store.Object{"data": data}, err
}

// joinInvitedProject accepts a pending project invitation addressed to email.
// The token proves that the person controls the invited inbox. A non-nil body
// is a client error to return as-is; err is a storage failure.
func joinInvitedProject(r *http.Request, tx pgx.Tx, token, userID, email string) (project string, status int, body store.Object, err error) {
	unavailable := invitationUnavailable()

	// Use the same project-first lock order as invitation creation and membership edits.
	err = tx.QueryRow(r.Context(), `SELECT p.id FROM projects p JOIN project_invitations i ON i.project_id=p.id WHERE i.token_hash=$1 AND p.status='active' FOR NO KEY UPDATE OF p`, store.Hash(token)).Scan(&project)
	if err == pgx.ErrNoRows {
		return "", 410, unavailable, nil
	}

	if err != nil {
		return "", 0, nil, err
	}

	var id, role string

	err = tx.QueryRow(r.Context(), `SELECT i.id,i.project_id,i.role FROM project_invitations i WHERE i.token_hash=$1 AND i.email=$2 AND i.accepted_at IS NULL AND i.expires_at>clock_timestamp() FOR UPDATE OF i`, store.Hash(token), email).Scan(&id, &project, &role)
	if err == pgx.ErrNoRows {
		return "", 410, unavailable, nil
	}

	if err != nil {
		return "", 0, nil, err
	}

	// Accepting an invitation never replaces an existing membership's privileges.
	_, err = tx.Exec(r.Context(), `INSERT INTO console_user_projects(user_id,project_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, userID, project, role)
	if err == nil {
		_, err = tx.Exec(r.Context(), "UPDATE project_invitations SET accepted_at=now() WHERE id=$1", id)
	}

	return project, 0, nil, err
}

// projectInvitationPreview lets the invitation link show the project, the
// invited email and whether that email already has an account, so the console
// can offer a single sign-in or sign-up step.
func (s *Server) projectInvitationPreview(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	var (
		email, project, role string
		expires              time.Time
		account              bool
	)

	err := s.Store.Pool.QueryRow(r.Context(), `SELECT i.email,p.name,i.role,i.expires_at,EXISTS(SELECT 1 FROM console_users u WHERE u.email=i.email) FROM project_invitations i JOIN projects p ON p.id=i.project_id WHERE i.token_hash=$1 AND i.accepted_at IS NULL AND i.expires_at>now() AND p.status='active'`, store.Hash(r.PathValue("token"))).Scan(&email, &project, &role, &expires, &account)
	if err != nil {
		invitationError(w, err)
		return
	}

	write(w, 200, store.Object{"data": store.Object{"email": email, "project_name": project, "role": role, "expires_at": expires.UTC().Format(time.RFC3339Nano), "account_exists": account}})
}

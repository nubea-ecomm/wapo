package api

import (
	"net/http"
	"strings"

	"wapo.local/server/internal/store"
)

func (s *Server) createOwnProject(w http.ResponseWriter, r *http.Request) {
	user, err := s.Store.AuthenticateSession(r.Context(), credential(r))
	if err != nil {
		fail(w, 401, "unauthorized", "Sign-in required")
		return
	}

	input, err := decode(r)
	if err != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}

	name := strings.TrimSpace(str(input, "name"))
	if name == "" || len(name) > 120 {
		fail(w, 422, "validation_error", "name must contain 1 to 120 bytes")
		return
	}

	tx, err := s.Store.Pool.Begin(r.Context())
	if err != nil {
		dbError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	id := store.ID("tenant")

	_, err = tx.Exec(r.Context(), "INSERT INTO projects(id,name) VALUES($1,$2)", id, name)
	if err == nil {
		_, err = tx.Exec(r.Context(), "INSERT INTO console_user_projects(user_id,project_id,role) VALUES($1,$2,'admin')", user.ID, id)
	}

	if err == nil {
		err = tx.Commit(r.Context())
	}

	if err != nil {
		dbError(w, err)
		return
	}

	write(w, 201, store.Object{"data": store.Object{"id": id, "name": name, "status": "active"}})
}

func (s *Server) acceptProjectInvitation(w http.ResponseWriter, r *http.Request) {
	user, err := s.Store.AuthenticateSession(r.Context(), credential(r))
	if err != nil {
		fail(w, 401, "unauthorized", "Sign-in required")
		return
	}

	tx, err := s.Store.Pool.Begin(r.Context())
	if err != nil {
		dbError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	var id, project, role string

	err = tx.QueryRow(r.Context(), `SELECT i.id,i.project_id,i.role FROM project_invitations i JOIN projects p ON p.id=i.project_id WHERE i.token_hash=$1 AND i.email=$2 AND i.accepted_at IS NULL AND i.expires_at>now() AND p.status='active' FOR UPDATE OF i`, store.Hash(r.PathValue("token")), user.Email).Scan(&id, &project, &role)
	if err != nil {
		invitationError(w, err)
		return
	}

	// Accepting an invitation never replaces an existing membership's privileges.
	_, err = tx.Exec(r.Context(), `INSERT INTO console_user_projects(user_id,project_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`, user.ID, project, role)
	if err == nil {
		_, err = tx.Exec(r.Context(), "UPDATE project_invitations SET accepted_at=now() WHERE id=$1", id)
	}

	if err == nil {
		err = tx.Commit(r.Context())
	}

	if err != nil {
		dbError(w, err)
		return
	}

	write(w, 200, store.Object{"data": store.Object{"project_id": project, "accepted": true}})
}

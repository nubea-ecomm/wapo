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

	if _, ok := lockAccountSession(w, r, tx, user.ID); !ok {
		return
	}

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

	var locked string

	// Use the same project-first lock order as invitation creation and membership edits.
	err = tx.QueryRow(r.Context(), `SELECT p.id FROM projects p JOIN project_invitations i ON i.project_id=p.id WHERE i.token_hash=$1 AND p.status='active' FOR NO KEY UPDATE OF p`, store.Hash(r.PathValue("token"))).Scan(&locked)
	if err != nil {
		invitationError(w, err)
		return
	}

	email, ok := lockAccountSession(w, r, tx, user.ID)
	if !ok {
		return
	}

	project, status, failure, err := joinInvitedProject(r, tx, r.PathValue("token"), user.ID, email)
	if failure != nil {
		write(w, status, failure)
		return
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

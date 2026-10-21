package api

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

func (s *Server) projectMembers(w http.ResponseWriter, r *http.Request, project, id string) {
	user, ok := r.Context().Value(consoleUserKey).(store.ConsoleUser)
	if !ok || user.Role != "admin" {
		fail(w, 403, "forbidden", "A project administrator session is required")
		return
	}

	if id != "" && (r.Method == "DELETE" || r.Method == "PATCH") {
		s.changeProjectMember(w, r, project, id)
		return
	}

	if id == "" && r.Method == "POST" {
		s.inviteProjectMember(w, r, project)
		return
	}

	if id != "" || r.Method != "GET" {
		fail(w, 405, "method_not_allowed", "Use GET, POST, PATCH or DELETE")
		return
	}

	rows, err := s.Store.Pool.Query(r.Context(), `SELECT u.id,u.name,u.email,m.role,u.active FROM console_user_projects m JOIN console_users u ON u.id=m.user_id WHERE m.project_id=$1 ORDER BY u.name,u.id`, project)
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()

	members := []store.Object{}

	for rows.Next() {
		var (
			id, name, email, role string
			active                bool
		)

		if err = rows.Scan(&id, &name, &email, &role, &active); err != nil {
			dbError(w, err)
			return
		}

		members = append(members, store.Object{"id": id, "name": name, "email": email, "role": role, "active": active})
	}

	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}

	write(w, 200, store.Object{"data": members})
}

func (s *Server) changeProjectMember(w http.ResponseWriter, r *http.Request, project, id string) {
	role := ""

	if r.Method == "PATCH" {
		input, err := decode(r)
		if err != nil {
			fail(w, 400, "invalid_json", "Valid JSON required")
			return
		}

		role = str(input, "role")
		if !validProjectRole(role) {
			fail(w, 422, "validation_error", "Invalid project role")
			return
		}
	}

	tx, err := s.Store.Pool.Begin(r.Context())
	if err != nil {
		dbError(w, err)
		return
	}
	defer tx.Rollback(r.Context())
	// Serialize membership edits per project to preserve its last administrator.
	var locked string

	if err = tx.QueryRow(r.Context(), "SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE", project).Scan(&locked); err != nil {
		dbError(w, err)
		return
	}

	if !projectAdminStillAllowed(w, r, tx, project) {
		return
	}

	var current string

	if err = tx.QueryRow(r.Context(), "SELECT role FROM console_user_projects WHERE project_id=$1 AND user_id=$2", project, id).Scan(&current); err != nil {
		dbError(w, notFound(err))
		return
	}

	if current == "admin" && role != "admin" {
		var others int

		if err = tx.QueryRow(r.Context(), `SELECT count(*) FROM console_user_projects m JOIN console_users u ON u.id=m.user_id WHERE m.project_id=$1 AND m.user_id<>$2 AND m.role='admin' AND u.active AND u.email_verified`, project, id).Scan(&others); err != nil {
			dbError(w, err)
			return
		}

		if others == 0 {
			fail(w, 409, "last_project_admin", "The project must retain an active administrator")
			return
		}
	}

	if r.Method == "DELETE" {
		_, err = tx.Exec(r.Context(), "DELETE FROM console_user_projects WHERE project_id=$1 AND user_id=$2", project, id)
	} else {
		_, err = tx.Exec(r.Context(), "UPDATE console_user_projects SET role=$3 WHERE project_id=$1 AND user_id=$2", project, id, role)
	}

	if err == nil {
		_, err = tx.Exec(r.Context(), `UPDATE project_invitations SET expires_at=LEAST(expires_at,now()) WHERE project_id=$1 AND email=(SELECT email FROM console_users WHERE id=$2) AND accepted_at IS NULL`, project, id)
	}

	if err == nil {
		err = tx.Commit(r.Context())
	}

	if err != nil {
		dbError(w, err)
		return
	}

	write(w, 200, store.Object{"data": store.Object{"updated": true, "at": time.Now().UTC()}})
}

func validProjectRole(role string) bool {
	return role == "admin" || role == "member" || role == "viewer" || role == "billing"
}

func projectAdminStillAllowed(w http.ResponseWriter, r *http.Request, tx pgx.Tx, project string) bool {
	actor, _ := r.Context().Value(consoleUserKey).(store.ConsoleUser)

	var allowed bool

	err := tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM console_users u WHERE u.id=$1 AND u.active AND u.email_verified AND ((u.all_projects AND u.role='admin') OR EXISTS(SELECT 1 FROM console_user_projects m WHERE m.user_id=u.id AND m.project_id=$2 AND m.role='admin')))`, actor.ID, project).Scan(&allowed)
	if err != nil {
		dbError(w, err)
		return false
	}

	if !allowed {
		fail(w, 403, "forbidden", "Project administrator access was revoked")
	}

	return allowed
}

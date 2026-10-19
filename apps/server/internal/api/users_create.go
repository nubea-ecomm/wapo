package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

func (s *Server) createConsoleUser(w http.ResponseWriter, r *http.Request) {
	input, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}

	email, e := store.NormalizeEmail(str(input, "email"))
	if e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}

	name := strings.TrimSpace(str(input, "name"))
	if name == "" || len(name) > 120 {
		fail(w, 422, "validation_error", "name must contain 1 to 120 bytes")
		return
	}

	access, e := parseUserAccess(input, userAccess{Role: "member", Projects: []string{}})
	if e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}

	invitation := s.Config.SMTPHost != ""
	password := str(input, "password")

	if invitation {
		password = store.ID("pending-password")
	}

	hash, e := store.PasswordHash(password)
	if e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}

	tx, e := s.Store.Pool.Begin(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(r.Context())

	id := store.ID("user")
	if _, e = tx.Exec(r.Context(), "INSERT INTO console_users(id,email,name,password_hash,role,all_projects,active) VALUES($1,$2,$3,$4,$5,$6,$7)", id, email, name, hash, access.Role, access.All, !invitation); e != nil {
		dbError(w, e)
		return
	}

	if e = saveUserAccess(r.Context(), tx, id, access); e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}

	if invitation {
		invitationID := store.ID("invitation")
		token := store.ID("invite")
		expires := time.Now().UTC().Add(7 * 24 * time.Hour)

		if _, e = tx.Exec(r.Context(), "INSERT INTO console_user_invitations(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,$4)", invitationID, id, store.Hash(token), expires); e != nil {
			dbError(w, e)
			return
		}

		projects, projectErr := invitationProjectNames(r.Context(), tx, access)
		if projectErr != nil {
			dbError(w, projectErr)
			return
		}

		payload, marshalErr := json.Marshal(store.Object{"name": name, "email": email, "invitation_id": invitationID, "invitation_token": s.Store.Seal(token, invitationID), "projects": projects, "expires_at": expires.Format(time.RFC3339Nano)})
		if marshalErr != nil {
			dbError(w, marshalErr)
			return
		}

		if _, e = tx.Exec(r.Context(), "INSERT INTO notification_deliveries(id,project_id,notification_type,dedupe_key,recipients,payload) VALUES($1,NULL,'user_invitation',$2,$3,$4)", store.ID("mail"), invitationID, []string{email}, payload); e != nil {
			dbError(w, e)
			return
		}
	}

	user, e := scanUser(tx.QueryRow(r.Context(), selectUser+" WHERE u.id=$1", id))
	if e != nil {
		dbError(w, e)
		return
	}

	if e = tx.Commit(r.Context()); e != nil {
		dbError(w, e)
		return
	}

	write(w, 201, store.Object{"data": user})
}

func invitationProjectNames(ctx context.Context, tx pgx.Tx, access userAccess) ([]string, error) {
	rows, err := tx.Query(ctx, "SELECT name FROM projects WHERE ($1 OR id=ANY($2)) AND status='active' ORDER BY name", access.All, access.Projects)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []string{}

	for rows.Next() {
		var name string

		if err = rows.Scan(&name); err != nil {
			return nil, err
		}

		projects = append(projects, name)
	}

	return projects, rows.Err()
}

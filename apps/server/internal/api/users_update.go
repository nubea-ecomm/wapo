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

	if value, changed := input["email"]; changed {
		raw, valid := value.(string)
		email, emailErr := store.NormalizeEmail(raw)

		if !valid || emailErr != nil {
			fail(w, 422, "validation_error", "A valid email is required")
			return
		}

		if current.InvitationPending {
			fail(w, 409, "invitation_pending", "Complete or replace the pending invitation before changing email")
			return
		}

		if email != current.Email {
			if _, e = tx.Exec(r.Context(), "UPDATE console_users SET email=$2,email_verified=true,confirm_selector='',confirm_verifier='',recover_selector='',recover_verifier='' WHERE id=$1", id, email); e != nil {
				dbError(w, e)
				return
			}

			if _, e = tx.Exec(r.Context(), "DELETE FROM console_sessions WHERE user_id=$1", id); e != nil {
				dbError(w, e)
				return
			}
		}
	}

	access, e := parseUserAccess(input, userAccess{Role: current.Role, All: current.AllProjects, Projects: current.ProjectIDs})
	if e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}

	_, roleChanged := input["role"]
	_, scopeChanged := input["all_projects"]
	_, projectsChanged := input["project_ids"]

	if roleChanged || scopeChanged || projectsChanged {
		if e = saveUserAccess(r.Context(), tx, id, access); e != nil {
			fail(w, 422, "validation_error", e.Error())
			return
		}
	}

	if active, ok := input["active"].(bool); ok {
		var pendingInvitation bool

		if active && str(input, "password") == "" {
			if e = tx.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM console_user_invitations WHERE user_id=$1 AND accepted_at IS NULL AND expires_at>now())", id).Scan(&pendingInvitation); e != nil {
				dbError(w, e)
				return
			}
		}

		if pendingInvitation {
			fail(w, 409, "invitation_pending", "Set a password or wait for the user to accept the invitation before activation")
			return
		}

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

		if _, e = tx.Exec(r.Context(), "UPDATE console_users SET password_hash=$2,recover_selector='',recover_verifier='' WHERE id=$1", id, hash); e != nil {
			dbError(w, e)
			return
		}

		if _, e = tx.Exec(r.Context(), "DELETE FROM console_sessions WHERE user_id=$1", id); e != nil {
			dbError(w, e)
			return
		}

		if _, e = tx.Exec(r.Context(), "UPDATE console_user_invitations SET accepted_at=now() WHERE user_id=$1 AND accepted_at IS NULL", id); e != nil {
			dbError(w, e)
			return
		}

		if _, e = tx.Exec(r.Context(), "UPDATE notification_deliveries SET state='failed',lease_until=NULL,last_error='invitation replaced by administrator password',payload=payload-'invitation_token',updated_at=now() WHERE notification_type='user_invitation' AND state IN ('pending','processing') AND payload->>'invitation_id' IN (SELECT invitation.id FROM console_user_invitations invitation WHERE invitation.user_id=$1)", id); e != nil {
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

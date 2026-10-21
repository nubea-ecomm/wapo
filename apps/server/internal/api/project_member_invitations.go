package api

import (
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/aarondl/authboss/v3"
	"wapo.local/server/internal/store"
)

func (s *Server) inviteProjectMember(w http.ResponseWriter, r *http.Request, project string) {
	if s.Config.SMTPHost == "" {
		fail(w, 503, "email_unavailable", "Email delivery is not configured")
		return
	}

	if !s.authRateLimit(w, r) {
		return
	}

	input, err := decode(r)
	if err != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}

	email, err := store.NormalizeEmail(str(input, "email"))
	role := str(input, "role")

	if role == "" {
		role = "member"
	}

	if err != nil || !validProjectRole(role) {
		fail(w, 422, "validation_error", "A valid email and project role are required")
		return
	}

	tx, err := s.Store.Pool.Begin(r.Context())
	if err != nil {
		dbError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	var locked string

	if err = tx.QueryRow(r.Context(), "SELECT id FROM projects WHERE id=$1 FOR UPDATE", project).Scan(&locked); err != nil {
		dbError(w, err)
		return
	}

	if !projectAdminStillAllowed(w, r, tx, project) {
		return
	}

	id, token := store.ID("invitation"), store.ID("invite")
	expires := time.Now().UTC().Add(7 * 24 * time.Hour)

	_, err = tx.Exec(r.Context(), `INSERT INTO project_invitations(id,project_id,email,role,token_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)`, id, project, email, role, store.Hash(token), expires)
	if err != nil {
		dbError(w, err)
		return
	}

	link := strings.TrimSpace(strings.Split(s.Config.WebOrigin, ",")[0]) + "/#/join-project?token=" + url.QueryEscape(token)
	mailer := authMailer{store: s.Store, storage: authStorage{tx: tx}}

	err = mailer.Send(r.Context(), authboss.Email{To: []string{email}, Subject: "Te invitaron a un proyecto en Wapo", TextBody: "Inicia sesión con este correo (o crea y verifica tu cuenta) para aceptar la invitación. El enlace vence en siete días.\n\n" + link})
	if err == nil {
		err = tx.Commit(r.Context())
	}

	if err != nil {
		dbError(w, err)
		return
	}

	write(w, 201, store.Object{"data": store.Object{"id": id, "email": email, "role": role, "expires_at": expires}})
}

package api

import (
	"context"
	"encoding/json"
	"html"
	"net/http"
	"strings"

	"github.com/aarondl/authboss/v3"
	"wapo.local/server/internal/store"
)

// authResponse buffers module output until the user and mail outbox transaction commits.
type authResponse struct {
	status int
	data   store.Object
}

func (a *authResponse) Respond(_ http.ResponseWriter, _ *http.Request, _ int, page string, data authboss.HTMLData) error {
	a.status = 422
	a.data = store.Object{"error": store.Object{"code": "validation_error", "message": "Check the submitted fields or request a new link", "fields": data[authboss.DataValidation]}}

	if page == "login" {
		a.status = 401
		a.data = store.Object{"error": store.Object{"code": "invalid_credentials", "message": "Email or password is incorrect"}}
	}

	return nil
}

func (a *authResponse) Redirect(_ http.ResponseWriter, r *http.Request, options authboss.RedirectOptions) error {
	if options.Failure != "" {
		a.status = 422
		a.data = store.Object{"error": store.Object{"code": "auth_failed", "message": "The link is invalid or expired"}}

		if strings.HasSuffix(r.URL.Path, "/login") {
			a.status = 403
			a.data = store.Object{"error": store.Object{"code": "email_unverified", "message": "Verify your email before signing in"}}
		}

		return nil
	}

	a.status = 200
	a.data = store.Object{"data": store.Object{"accepted": true}}

	return nil
}

type authRenderer struct{}

func (authRenderer) Load(...string) error { return nil }
func (authRenderer) Render(_ context.Context, page string, data authboss.HTMLData) ([]byte, string, error) {
	link, _ := data["url"].(string)
	intro := "Verifica tu correo para activar tu cuenta en Wapo. El enlace vence en 24 horas."

	if recovery, ok := data["recover_url"].(string); ok {
		link = recovery
		intro = "Restablece tu contraseña de Wapo. El enlace vence en una hora. Si no lo solicitaste, ignora este correo."
	}

	if strings.HasSuffix(page, "_html") {
		return []byte("<p>" + html.EscapeString(intro) + "</p><p><a href=\"" + html.EscapeString(link) + "\">Continuar en Wapo</a></p>"), "text/html", nil
	}

	return []byte(intro + "\n\n" + link), "text/plain", nil
}

type authMailer struct {
	store   *store.Store
	storage authStorage
	err     error
}

func (m *authMailer) Send(ctx context.Context, email authboss.Email) error {
	id := store.ID("mail")

	var body []byte

	body, m.err = json.Marshal(store.Object{"subject": email.Subject, "text": email.TextBody, "html": email.HTMLBody})

	if m.err != nil {
		return m.err
	}

	payload := store.Object{"invitation_id": id, "invitation_token": m.store.Seal(string(body), id)}
	_, m.err = m.storage.tx.Exec(ctx, `INSERT INTO notification_deliveries(id,notification_type,dedupe_key,recipients,payload) VALUES($1,'auth_mail',$1,$2,$3)`, id, email.To, payload)

	return m.err
}

// Authboss can include tokens in diagnostics. Do not forward those messages;
// request IDs and database failures are handled by the API boundary.
type authLogger struct{}

func (authLogger) Info(string)  {}
func (authLogger) Error(string) {}

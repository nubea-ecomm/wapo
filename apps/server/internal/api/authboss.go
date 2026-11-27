package api

import (
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/aarondl/authboss/v3"
	"github.com/aarondl/authboss/v3/auth"
	"github.com/aarondl/authboss/v3/defaults"
	recovery "github.com/aarondl/authboss/v3/recover"
	"github.com/aarondl/authboss/v3/register"
	"wapo.local/server/internal/store"
)

func (s *Server) authFlow(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	if origin := r.Header.Get("Origin"); origin != "" && !s.Config.AllowsOrigin(origin) {
		fail(w, 403, "forbidden", "Origin is not allowed")
		return
	}

	if !s.authRateLimit(w, r) {
		return
	}

	flow := strings.TrimPrefix(r.URL.Path, "/auth/v1/")
	if flow == "confirm" || flow == "confirm/resend" {
		// Accounts no longer need email verification; old links and SDK calls succeed.
		write(w, 200, store.Object{"data": store.Object{"accepted": true}})
		return
	}

	if flow == "recover" && s.Config.SMTPHost == "" {
		fail(w, 503, "email_unavailable", "Email delivery is not configured")
		return
	}

	// Decode once before entering Authboss, preserving the API's JSON error contract.
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

	storage := authStorage{tx: tx}
	response := &authResponse{}
	mailer := &authMailer{store: s.Store, storage: storage}
	ab := authboss.New()
	ab.Storage.Server = storage
	ab.Core.ViewRenderer = authRenderer{}
	defaults.SetCore(&ab.Config, true, false)
	ab.Core.Responder = response
	ab.Core.Redirector = response
	ab.Core.BodyReader = authParsedBody{input: input}
	ab.Core.MailRenderer = authRenderer{}
	ab.Core.Mailer = mailer
	ab.Core.Logger = authLogger{}
	ab.Core.Hasher = authboss.NewBCryptHasher(12)
	ab.Modules.MailNoGoroutine = true
	ab.Modules.RecoverTokenDuration = time.Hour
	ab.Modules.RecoverLoginAfterRecovery = false
	ab.Mail.RootURL = strings.TrimSpace(strings.Split(s.Config.WebOrigin, ",")[0]) + "/#"
	ab.Mail.From = s.Config.SMTPFromAddress
	ab.Mail.FromName = s.Config.SMTPFromName
	ab.Events.Before(authboss.EventAuth, func(_ http.ResponseWriter, r *http.Request, _ bool) (bool, error) {
		u, err := ab.CurrentUser(r)
		if err != nil {
			return false, err
		}

		if !u.(*authUser).Active {
			response.status = 401
			response.data = store.Object{"error": store.Object{"code": "invalid_credentials", "message": "Email or password is incorrect"}}

			return true, nil
		}

		return false, nil
	})
	ab.Events.Before(authboss.EventRecoverStart, func(_ http.ResponseWriter, r *http.Request, _ bool) (bool, error) {
		u, err := ab.CurrentUser(r)
		if err != nil {
			return false, err
		}

		if !u.(*authUser).Active {
			response.status = 200
			response.data = store.Object{"data": store.Object{"accepted": true}}

			return true, nil
		}

		return false, nil
	})
	// Preserve the existing opaque, revocable session contract for SDK clients.
	ab.Events.Before(authboss.EventAuthHijack, func(_ http.ResponseWriter, r *http.Request, _ bool) (bool, error) {
		u, err := ab.CurrentUser(r)
		if err != nil {
			return true, err
		}

		response.status, response.data, err = startConsoleSession(r, tx, u.(*authUser).ID, nil)

		return true, err
	})
	// Creating an account signs the person in immediately. An invitation token
	// proves ownership of the invited email, so the invitation is accepted in the
	// same transaction.
	ab.Events.After(authboss.EventRegister, func(_ http.ResponseWriter, r *http.Request, _ bool) (bool, error) {
		u, err := ab.CurrentUser(r)
		if err != nil {
			return true, err
		}

		var joined store.Object

		if token := str(input, "invitation_token"); token != "" {
			project, status, failure, joinErr := joinInvitedProject(r, tx, token, u.(*authUser).ID, u.(*authUser).Email)
			if joinErr != nil {
				return true, joinErr
			}

			if failure != nil {
				response.status, response.data = status, failure
				return true, nil
			}

			joined = store.Object{"project_id": project, "accepted": true}
		}

		response.status, response.data, err = startConsoleSession(r, tx, u.(*authUser).ID, joined)

		return true, err
	})

	if err = ab.Init("auth", "register", "recover"); err != nil {
		dbError(w, err)
		return
	}

	switch flow {
	case "login":
		err = (&auth.Auth{Authboss: ab}).LoginPost(w, r)
	case "register":
		err = (&register.Register{Authboss: ab}).Post(w, r)
	case "recover":
		err = (&recovery.Recover{Authboss: ab}).StartPost(w, r)
	case "recover/end":
		err = (&recovery.Recover{Authboss: ab}).EndPost(w, r)
	default:
		fail(w, 404, "not_found", "Authentication endpoint not found")
		return
	}

	if err == nil {
		err = mailer.err
	}

	if err != nil {
		dbError(w, err)
		return
	}

	if response.status < 400 {
		err = tx.Commit(r.Context())
	}

	if err != nil {
		dbError(w, err)
		return
	}

	write(w, response.status, response.data)
}

func (s *Server) authRateLimit(w http.ResponseWriter, r *http.Request) bool {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	limit := s.Config.LoginRateLimit

	if limit == 0 {
		limit = 10
	}

	allowed, err := s.Store.AllowRequest(r.Context(), "login", "login:"+host, limit)
	if err != nil {
		fail(w, 503, "unavailable", "Rate limit storage unavailable")
		return false
	}

	if !allowed {
		w.Header().Set("Retry-After", "60")
		fail(w, 429, "login_rate_limited", "Too many attempts; try again in a minute")
	}

	return allowed
}

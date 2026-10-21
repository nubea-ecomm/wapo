package api

import (
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/aarondl/authboss/v3"
	"github.com/aarondl/authboss/v3/auth"
	"github.com/aarondl/authboss/v3/confirm"
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
	if flow != "login" && s.Config.SMTPHost == "" {
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

		if !u.(*authUser).Active || !u.(*authUser).Confirmed {
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

		token := store.ID("wapo_session")
		expires := time.Now().UTC().Add(12 * time.Hour)

		_, err = tx.Exec(r.Context(), "INSERT INTO console_sessions(hash,user_id,expires_at) VALUES($1,$2,$3)", store.Hash(token), u.(*authUser).ID, expires)
		if err != nil {
			return true, err
		}

		user, err := scanUser(tx.QueryRow(r.Context(), selectUser+" WHERE u.id=$1", u.(*authUser).ID))
		if err != nil {
			return true, err
		}

		user.ProjectRoles, err = store.LoadProjectRoles(r.Context(), tx, user.ID)
		response.status = 200
		response.data = store.Object{"data": store.Object{"token": token, "expires_at": expires, "user": user}}

		return true, err
	})

	if err = ab.Init("auth", "register", "confirm", "recover"); err != nil {
		dbError(w, err)
		return
	}

	switch flow {
	case "login":
		err = (&auth.Auth{Authboss: ab}).LoginPost(w, r)
	case "register":
		err = (&register.Register{Authboss: ab}).Post(w, r)
	case "confirm":
		err = (&confirm.Confirm{Authboss: ab}).Get(w, r)
	case "recover":
		err = (&recovery.Recover{Authboss: ab}).StartPost(w, r)
	case "recover/end":
		err = (&recovery.Recover{Authboss: ab}).EndPost(w, r)
	case "confirm/resend":
		var user authboss.User

		user, err = storage.Load(r.Context(), strings.ToLower(strings.TrimSpace(str(input, "email"))))

		if err == authboss.ErrUserNotFound {
			err = nil
		} else if err == nil && user.(*authUser).Active && !user.(*authUser).Confirmed {
			err = (&confirm.Confirm{Authboss: ab}).StartConfirmation(r.Context(), user.(*authUser), true)
		}

		response.status = 200
		response.data = store.Object{"data": store.Object{"accepted": true}}
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

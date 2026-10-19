package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := credential(r)

		if key == "" {
			fail(w, 401, "unauthorized", "An API key is required")
			return
		}

		var (
			p           string
			e           error
			sessionUser store.ConsoleUser
		)

		consoleSession := strings.HasPrefix(key, "wapo_session_")
		keyHash := ""

		if !consoleSession {
			keyHash = store.Hash(key)
		}

		technicalOperator := !consoleSession && s.isTechnicalOperatorHash(keyHash)

		// Credential prefixes are disjoint. Selecting one authentication path avoids
		// an unnecessary database query on every public API request.
		if consoleSession {
			sessionUser, e = s.Store.AuthenticateSession(r.Context(), key)
			consoleSession = e == nil
		} else if !technicalOperator {
			p, e = s.Store.AuthenticateHash(r.Context(), keyHash)
		}

		if consoleSession && (!userProject(sessionUser, r.Header.Get("X-Tenant-ID")) || !projectPermission(sessionUser, r)) {
			fail(w, 403, "forbidden", "Your role does not allow this operation or project")
			return
		}

		if consoleSession || technicalOperator {
			p = r.Header.Get("X-Tenant-ID")

			var active bool

			e = s.Store.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1 AND status='active')", p).Scan(&active)

			if e == nil && !active {
				fail(w, 403, "tenant_unavailable", "Select an active tenant using X-Tenant-ID")
				return
			}
		}

		if e != nil {
			if errors.Is(e, pgx.ErrNoRows) {
				fail(w, 401, "unauthorized", "Invalid API key")
			} else {
				fail(w, 503, "unavailable", "Authentication storage unavailable")
			}

			return
		}

		if s.Config.PublicRateLimit > 0 {
			allowed, limitError := s.Store.AllowRequest(r.Context(), "project", p, s.Config.PublicRateLimit)
			if limitError != nil {
				fail(w, 503, "unavailable", "Rate limit storage unavailable")
				return
			}

			if !allowed {
				w.Header().Set("Retry-After", "60")
				s.serveLogged(w, r.WithContext(context.WithValue(r.Context(), projectKey, p)), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					fail(w, 429, "rate_limited", "Project request limit exceeded")
				}))

				return
			}
		}

		w.Header().Set("Cache-Control", "no-store")

		if consoleSession {
			r = r.WithContext(context.WithValue(r.Context(), consoleUserKey, sessionUser))
		}

		s.serveLogged(w, r.WithContext(context.WithValue(r.Context(), projectKey, p)), next)
	})
}

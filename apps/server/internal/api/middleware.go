package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
)

func (s *Server) auth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.Header.Get("X-API-Key")
		if key == "" {
			key = strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		}

		if key == "" {
			fail(w, 401, "unauthorized", "An API key is required")
			return
		}

		p, e := s.Store.Authenticate(r.Context(), key)
		sessionUser, sessionError := s.Store.AuthenticateSession(r.Context(), key)
		consoleSession := strings.HasPrefix(key, "wapo_session_") && sessionError == nil

		if consoleSession && (!userProject(sessionUser, r.Header.Get("X-Tenant-ID")) || !projectPermission(sessionUser, r)) {
			fail(w, 403, "forbidden", "Your role does not allow this operation or project")
			return
		}

		if consoleSession || s.isOperator(r, key) {
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

		allowed, limitError := s.Store.AllowRequest(r.Context(), "project", p, 300)
		if limitError != nil {
			fail(w, 503, "unavailable", "Rate limit storage unavailable")
			return
		}

		if !allowed {
			w.Header().Set("Retry-After", "60")
			s.serveLogged(w, r.WithContext(context.WithValue(r.Context(), projectKey, p)), http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				fail(w, 429, "rate_limited", "Limit of 300 requests per project per minute exceeded")
			}))

			return
		}

		w.Header().Set("Cache-Control", "no-store")
		s.serveLogged(w, r.WithContext(context.WithValue(r.Context(), projectKey, p)), next)
	})
}

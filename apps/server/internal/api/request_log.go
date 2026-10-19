package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

type logResponse struct {
	http.ResponseWriter
	status int
}

func (w *logResponse) WriteHeader(status int) {
	if w.status != 0 {
		return
	}

	w.status = status
	w.ResponseWriter.WriteHeader(status)
}

func (w *logResponse) Write(raw []byte) (int, error) {
	if w.status == 0 {
		w.WriteHeader(200)
	}

	return w.ResponseWriter.Write(raw)
}
func (w *logResponse) Unwrap() http.ResponseWriter { return w.ResponseWriter }

// Log routing metadata only. Request bodies, query strings and headers are never persisted.
func (s *Server) serveLogged(w http.ResponseWriter, r *http.Request, next http.Handler) {
	if strings.HasPrefix(r.URL.Path, "/v1/logs") {
		next.ServeHTTP(w, r)
		return
	}

	started := time.Now()
	response := &logResponse{ResponseWriter: w}

	defer func() {
		recovered := recover()
		status := response.status

		if status == 0 {
			status = 200
		}

		if recovered != nil {
			status = 500
		}

		elapsed := float64(time.Since(started).Microseconds()) / 1000
		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), time.Second)

		defer cancel()

		_, e := s.Store.Pool.Exec(ctx, `INSERT INTO request_logs(id,project_id,request_id,method,path,status,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7)`, store.ID("log"), project(r), w.Header().Get("X-Request-ID"), r.Method, logPath(r.URL.Path), status, elapsed)
		if e != nil {
			slog.Warn("request log persistence failed", "request_id", w.Header().Get("X-Request-ID"))
		}

		if recovered != nil {
			panic(recovered)
		}
	}()

	next.ServeHTTP(response, r)
}

func (s *Server) serveAdminLogged(w http.ResponseWriter, r *http.Request, next http.Handler, actorType, actorID string) {
	started := time.Now()
	response := &logResponse{ResponseWriter: w}

	defer func() {
		recovered := recover()
		status := response.status

		if status == 0 {
			status = 200
		}

		if recovered != nil {
			status = 500
		}

		ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), time.Second)

		defer cancel()

		_, e := s.Store.Pool.Exec(ctx, `INSERT INTO admin_audit_logs(id,request_id,actor_type,actor_id,method,path,target_project,status,duration_ms) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, store.ID("audit"), w.Header().Get("X-Request-ID"), actorType, actorID, r.Method, logPath(r.URL.Path), adminTargetProject(r), status, float64(time.Since(started).Microseconds())/1000)
		if e != nil {
			slog.Warn("admin audit persistence failed", "request_id", w.Header().Get("X-Request-ID"))
		}

		if recovered != nil {
			panic(recovered)
		}
	}()

	next.ServeHTTP(response, r)
}

func adminTargetProject(r *http.Request) string {
	if project := r.Header.Get("X-Tenant-ID"); project != "" {
		return project
	}

	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) >= 4 && parts[0] == "admin" && parts[1] == "v1" && parts[2] == "tenants" {
		return parts[3]
	}

	return ""
}

func logPath(path string) string {
	known := map[string]bool{"admin": true, "v1": true, "platform": true, "meta": true, "whatsapp": true, "project": true, "me": true, "overview": true, "channels": true, "customers": true, "connections": true, "messages": true, "conversations": true, "events": true, "api_keys": true, "setup_links": true, "webhooks": true, "deliveries": true, "retry": true, "phone_numbers": true, "templates": true, "media": true, "sync": true, "tenants": true, "users": true, "settings": true}
	parts := strings.Split(strings.Trim(path, "/"), "/")

	for i, part := range parts {
		if !known[part] {
			parts[i] = ":id"
		}
	}

	return "/" + strings.Join(parts, "/")
}

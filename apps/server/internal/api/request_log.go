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

type requestLogEntry struct {
	id, projectID, requestID, method, path string
	status                                 int
	duration                               float64
}

type requestLogCommand struct {
	entry *requestLogEntry
	flush chan struct{}
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

		if s.shouldLogRequest(status) {
			elapsed := float64(time.Since(started).Microseconds()) / 1000
			s.enqueueRequestLog(requestLogEntry{id: store.ID("log"), projectID: project(r), requestID: w.Header().Get("X-Request-ID"), method: r.Method, path: logPath(r.URL.Path), status: status, duration: elapsed})
		}

		if recovered != nil {
			panic(recovered)
		}
	}()

	next.ServeHTTP(response, r)
}

func (s *Server) shouldLogRequest(status int) bool {
	if status >= 400 {
		return true
	}

	if s.logEvery == 0 {
		return false
	}

	if s.logEvery == 1 {
		return true
	}

	return s.logSequence.Add(1)%s.logEvery == 0
}

func (s *Server) enqueueRequestLog(entry requestLogEntry) {
	select {
	case s.logQueue <- requestLogCommand{entry: &entry}:
	default:
		// Telemetry must never apply backpressure to message delivery. The bounded
		// queue makes overload explicit while protecting API memory and latency.
		if dropped := s.droppedLogs.Add(1); dropped == 1 || dropped%10000 == 0 {
			slog.Warn("request log queue full", "dropped", dropped)
		}
	}
}

func (s *Server) flushRequestLogs(ctx context.Context) {
	done := make(chan struct{})
	select {
	case s.logQueue <- requestLogCommand{flush: done}:
	case <-ctx.Done():
		return
	}

	select {
	case <-done:
	case <-ctx.Done():
	}
}

func (s *Server) runRequestLogWriter() {
	defer close(s.logDone)

	ticker := time.NewTicker(20 * time.Millisecond)

	defer ticker.Stop()

	batch := make([]requestLogEntry, 0, 256)
	flush := func() {
		if len(batch) == 0 {
			return
		}

		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		if e := s.persistRequestLogs(ctx, batch); e != nil {
			slog.Warn("request log batch persistence failed", "count", len(batch), "error", e)
		}

		cancel()

		batch = batch[:0]
	}

	for {
		select {
		case command, ok := <-s.logQueue:
			if !ok {
				flush()
				return
			}

			if command.entry != nil {
				batch = append(batch, *command.entry)
			}

			if len(batch) == cap(batch) || command.flush != nil {
				flush()
			}

			if command.flush != nil {
				close(command.flush)
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (s *Server) persistRequestLogs(ctx context.Context, entries []requestLogEntry) error {
	ids, projects, requests := make([]string, len(entries)), make([]string, len(entries)), make([]string, len(entries))
	methods, paths := make([]string, len(entries)), make([]string, len(entries))
	statuses, durations := make([]int32, len(entries)), make([]float64, len(entries))

	for i, entry := range entries {
		ids[i], projects[i], requests[i] = entry.id, entry.projectID, entry.requestID
		methods[i], paths[i] = entry.method, entry.path
		statuses[i], durations[i] = int32(entry.status), entry.duration
	}

	_, e := s.Store.Pool.Exec(ctx, `
		INSERT INTO request_logs(id,project_id,request_id,method,path,status,duration_ms)
		SELECT u.id,u.project_id,u.request_id,u.method,u.path,u.status,u.duration_ms
		FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[],$6::integer[],$7::double precision[])
		 AS u(id,project_id,request_id,method,path,status,duration_ms)
		JOIN projects p ON p.id=u.project_id`, ids, projects, requests, methods, paths, statuses, durations)

	return e
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

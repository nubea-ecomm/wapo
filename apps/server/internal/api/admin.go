package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) adminAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := credential(r)

		var (
			user store.ConsoleUser
			e    error
		)

		if strings.HasPrefix(key, "wapo_session_") {
			user, e = s.Store.AuthenticateSession(r.Context(), key)
		}

		authenticated := strings.HasPrefix(key, "wapo_session_") && e == nil
		listing := r.Method == "GET" && (r.URL.Path == "/admin/v1/tenants" || r.URL.Path == "/admin/v1/me")
		operator := s.isTechnicalOperator(key) || (authenticated && user.Role == "admin" && user.AllProjects)

		if !operator && !(authenticated && listing) {
			status := 401
			if authenticated {
				status = 403
			}

			fail(w, status, "admin_unauthorized", "Global administrator access is required")

			return
		}

		if authenticated {
			r = r.WithContext(context.WithValue(r.Context(), consoleUserKey, user))
		}

		w.Header().Set("Cache-Control", "no-store")

		actorType := "technical"
		actorID := "admin_api_key"

		if authenticated {
			actorType = "user"
			actorID = user.ID
		}

		s.serveAdminLogged(w, r, next, actorType, actorID)
	})
}

func (s *Server) admin(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/admin/v1/"), "/"), "/")
	if parts[0] == "me" && len(parts) == 1 && r.Method == "GET" {
		write(w, 200, store.Object{"data": store.Object{"role": "operator"}})
		return
	}

	if len(parts) == 2 && parts[0] == "settings" && parts[1] == "whatsapp" {
		s.whatsappSettings(w, r)
		return
	}

	if len(parts) == 2 && parts[0] == "settings" && parts[1] == "email" {
		if r.Method != "GET" {
			fail(w, 405, "method_not_allowed", "Use GET")
			return
		}

		write(w, 200, store.Object{"data": store.Object{"smtp_configured": s.Config.SMTPHost != ""}})

		return
	}

	if parts[0] == "users" && len(parts) <= 2 {
		id := ""
		if len(parts) == 2 {
			id = parts[1]
		}

		s.users(w, r, id)

		return
	}

	if parts[0] != "tenants" || len(parts) > 4 {
		fail(w, 404, "not_found", "Admin endpoint not found")
		return
	}

	if len(parts) == 1 {
		switch r.Method {
		case "GET":
			s.listTenants(w, r)
		case "POST":
			s.createTenant(w, r)
		default:
			fail(w, 405, "method_not_allowed", "Use GET or POST")
		}

		return
	}

	tenant := parts[1]
	if len(parts) >= 3 && parts[2] == "api_keys" {
		id := ""
		if len(parts) == 4 {
			id = parts[3]
		}

		s.apiKeys(w, r, tenant, id)

		return
	}

	if len(parts) != 2 {
		fail(w, 404, "not_found", "Admin endpoint not found")
		return
	}

	if r.Method == "DELETE" {
		s.deleteTenant(w, r, tenant)
		return
	}

	if r.Method != "PATCH" {
		fail(w, 405, "method_not_allowed", "Use PATCH or DELETE")
		return
	}

	o, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}

	name := str(o, "name")
	status := str(o, "status")

	if name == "" && status == "" {
		fail(w, 422, "validation_error", "name or status is required")
		return
	}

	if status != "" && status != "active" && status != "suspended" {
		fail(w, 422, "validation_error", "status must be active or suspended")
		return
	}

	var id, actualName, actualStatus string

	e = s.Store.Pool.QueryRow(r.Context(), "UPDATE projects SET name=CASE WHEN $2='' THEN name ELSE $2 END,status=CASE WHEN $3='' THEN status ELSE $3 END WHERE id=$1 RETURNING id,name,status", tenant, name, status).Scan(&id, &actualName, &actualStatus)
	if e != nil {
		dbError(w, notFound(e))
		return
	}

	if status != "" {
		s.Store.InvalidateProjectAuthentication(tenant)
	}

	write(w, 200, store.Object{"data": store.Object{"id": id, "name": actualName, "status": actualStatus}})
}

func (s *Server) listTenants(w http.ResponseWriter, r *http.Request) {
	rows, e := s.Store.Pool.Query(r.Context(), `SELECT p.id,p.name,p.status,p.created_at,COALESCE(p.branding->>'logo_id',''),(SELECT count(*) FROM api_keys k WHERE k.project_id=p.id AND k.revoked_at IS NULL) FROM projects p WHERE ($1 OR p.id=ANY($2)) ORDER BY p.created_at DESC,p.id`, s.canListAllProjects(r), s.assignedProjects(r))
	if e != nil {
		dbError(w, e)
		return
	}
	defer rows.Close()

	out := []store.Object{}

	for rows.Next() {
		var (
			id, name, status, logoID string
			at                       time.Time
			count                    int
		)

		if e = rows.Scan(&id, &name, &status, &at, &logoID, &count); e != nil {
			dbError(w, e)
			return
		}

		out = append(out, store.Object{"id": id, "name": name, "status": status, "created_at": at.UTC().Format(time.RFC3339Nano), "active_keys": count, "logo_url": projectLogoURL(id, logoID)})
	}

	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}

	write(w, 200, store.Object{"data": out})
}

func (s *Server) createTenant(w http.ResponseWriter, r *http.Request) {
	o, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}

	name := strings.TrimSpace(str(o, "name"))
	if name == "" || len(name) > 120 {
		fail(w, 422, "validation_error", "name must be between 1 and 120 characters")
		return
	}

	id := store.ID("tenant")

	_, e = s.Store.Pool.Exec(r.Context(), "INSERT INTO projects(id,name) VALUES($1,$2)", id, name)
	if e != nil {
		dbError(w, e)
		return
	}

	write(w, 201, store.Object{"data": store.Object{"id": id, "name": name, "status": "active"}})
}

const consoleUserKey contextKey = "console-user"

func (s *Server) canListAllProjects(r *http.Request) bool {
	user, ok := r.Context().Value(consoleUserKey).(store.ConsoleUser)
	return !ok || user.AllProjects
}

func (s *Server) assignedProjects(r *http.Request) []string {
	user, _ := r.Context().Value(consoleUserKey).(store.ConsoleUser)
	return user.ProjectIDs
}

package api

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
	"wapo.local/server/internal/store"
)

func credential(r *http.Request) string {
	if key := r.Header.Get("X-API-Key"); key != "" {
		return key
	}
	return strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
}
func (s *Server) isOperator(r *http.Request, key string) bool {
	if s.Config.AdminKey != "" && subtle.ConstantTimeCompare([]byte(store.Hash(key)), []byte(store.Hash(s.Config.AdminKey))) == 1 {
		return true
	}
	if !strings.HasPrefix(key, "wapo_session_") {
		return false
	}
	user, e := s.Store.AuthenticateSession(r.Context(), key)
	return e == nil && user.Role == "admin" && user.AllProjects
}
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	host, _, _ := net.SplitHostPort(r.RemoteAddr)
	limitKey := "login:" + host
	allowed, limitError := s.Store.AllowRequest(r.Context(), "login", limitKey, 10)
	if limitError != nil {
		fail(w, 503, "unavailable", "Rate limit storage unavailable")
		return
	}
	if !allowed {
		w.Header().Set("Retry-After", "60")
		fail(w, 429, "login_rate_limited", "Too many sign-in attempts; try again in a minute")
		return
	}
	input, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}
	email, _ := store.NormalizeEmail(str(input, "email"))
	password := str(input, "password")
	var user store.ConsoleUser
	var hash string
	e = s.Store.Pool.QueryRow(r.Context(), "SELECT u.id,u.email,u.name,u.active,u.created_at,u.password_hash,u.role,u.all_projects,ARRAY(SELECT project_id FROM console_user_projects WHERE user_id=u.id ORDER BY project_id) FROM console_users u WHERE email=$1", email).Scan(&user.ID, &user.Email, &user.Name, &user.Active, &user.CreatedAt, &hash, &user.Role, &user.AllProjects, &user.ProjectIDs)
	if e != nil {
		hash = "$2a$12$LXrCnzSg7Nk7dQ1aUEW3zOI/NpkfT.PKkFjPVVEhZv1uOGSso7/OW"
	}
	passwordOK := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
	if e != nil || !user.Active || !passwordOK {
		fail(w, 401, "invalid_credentials", "Email or password is incorrect")
		return
	}
	token := store.ID("wapo_session")
	expires := time.Now().UTC().Add(12 * time.Hour)
	_, e = s.Store.Pool.Exec(r.Context(), "INSERT INTO console_sessions(hash,user_id,expires_at) VALUES($1,$2,$3)", store.Hash(token), user.ID, expires)
	if e != nil {
		dbError(w, e)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	write(w, 200, store.Object{"data": store.Object{"token": token, "expires_at": expires, "user": user}})
}
func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	_, e := s.Store.Pool.Exec(r.Context(), "DELETE FROM console_sessions WHERE hash=$1", store.Hash(credential(r)))
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, store.Object{"data": store.Object{"signed_out": true}})
}

func (s *Server) consoleProfile(w http.ResponseWriter, r *http.Request) {
	user, e := s.Store.AuthenticateSession(r.Context(), credential(r))
	if e != nil {
		fail(w, 401, "unauthorized", "Sign-in required")
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	write(w, 200, store.Object{"data": store.Object{"user": user}})
}

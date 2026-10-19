package api

import (
	"net/http"
	"strings"
	"wapo.local/server/internal/store"
)

func (s *Server) createConsoleUser(w http.ResponseWriter, r *http.Request) {
	input, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}
	email, e := store.NormalizeEmail(str(input, "email"))
	if e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}
	name := strings.TrimSpace(str(input, "name"))
	if name == "" || len(name) > 120 {
		fail(w, 422, "validation_error", "name must contain 1 to 120 bytes")
		return
	}
	access, e := parseUserAccess(input, userAccess{Role: "member", Projects: []string{}})
	if e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}
	hash, e := store.PasswordHash(str(input, "password"))
	if e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}
	tx, e := s.Store.Pool.Begin(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(r.Context())
	id := store.ID("user")
	if _, e = tx.Exec(r.Context(), "INSERT INTO console_users(id,email,name,password_hash,role,all_projects) VALUES($1,$2,$3,$4,$5,$6)", id, email, name, hash, access.Role, access.All); e != nil {
		dbError(w, e)
		return
	}
	if e = saveUserAccess(r.Context(), tx, id, access); e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}
	user, e := scanUser(tx.QueryRow(r.Context(), selectUser+" WHERE u.id=$1", id))
	if e != nil {
		dbError(w, e)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, store.Object{"data": user})
}

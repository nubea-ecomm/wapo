package api

import (
	"errors"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	"wapo.local/server/internal/store"
)

func (s *Server) updateConsoleProfile(w http.ResponseWriter, r *http.Request) {
	current, e := s.Store.AuthenticateSession(r.Context(), credential(r))
	if e != nil {
		fail(w, http.StatusUnauthorized, "unauthorized", "Sign-in required")
		return
	}
	input, e := decode(r)
	if e != nil {
		fail(w, http.StatusBadRequest, "invalid_json", "Valid JSON required")
		return
	}
	allowed := map[string]bool{"name": true, "email": true, "language": true, "avatar_variant": true}
	for field := range input {
		if !allowed[field] {
			fail(w, http.StatusUnprocessableEntity, "validation_error", "unknown profile field: "+field)
			return
		}
	}
	name, email, language, avatar := current.Name, current.Email, current.Language, current.AvatarVariant
	if value, ok := input["name"]; ok {
		name, ok = value.(string)
		name = strings.TrimSpace(name)
		if !ok || utf8.RuneCountInString(name) < 1 || utf8.RuneCountInString(name) > 120 {
			fail(w, http.StatusUnprocessableEntity, "validation_error", "name must contain between 1 and 120 characters")
			return
		}
	}
	if value, ok := input["email"]; ok {
		raw, valid := value.(string)
		if !valid {
			fail(w, http.StatusUnprocessableEntity, "validation_error", "a valid email address is required")
			return
		}
		email, e = store.NormalizeEmail(raw)
		if e != nil {
			fail(w, http.StatusUnprocessableEntity, "validation_error", e.Error())
			return
		}
	}
	if value, ok := input["language"]; ok {
		language, ok = value.(string)
		if !ok || (language != "es" && language != "pt" && language != "en") {
			fail(w, http.StatusUnprocessableEntity, "validation_error", "language must be es, pt or en")
			return
		}
	}
	if value, ok := input["avatar_variant"]; ok {
		number, valid := value.(float64)
		if !valid || number < 0 || number > 2147483647 || number != float64(int(number)) {
			fail(w, http.StatusUnprocessableEntity, "validation_error", "avatar_variant must be an integer between 0 and 2147483647")
			return
		}
		avatar = int(number)
	}
	if len(input) == 0 {
		fail(w, http.StatusUnprocessableEntity, "validation_error", "at least one profile field is required")
		return
	}
	_, e = s.Store.Pool.Exec(r.Context(), "UPDATE console_users SET name=$2,email=$3,language=$4,avatar_variant=$5 WHERE id=$1", current.ID, name, email, language, avatar)
	if e != nil {
		var pgError *pgconn.PgError
		if errors.As(e, &pgError) && pgError.Code == "23505" {
			fail(w, http.StatusConflict, "email_in_use", "Email is already in use")
			return
		}
		dbError(w, e)
		return
	}
	updated, e := s.Store.AuthenticateSession(r.Context(), credential(r))
	if e != nil {
		dbError(w, e)
		return
	}
	w.Header().Set("Cache-Control", "no-store")
	write(w, http.StatusOK, store.Object{"data": store.Object{"user": updated}})
}

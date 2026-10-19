package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

func notFound(e error) error {
	if errors.Is(e, pgx.ErrNoRows) {
		return store.ErrNotFound
	}

	return e
}

func (s *Server) apiKeys(w http.ResponseWriter, r *http.Request, p, id string) {
	var exists bool

	if e := s.Store.Pool.QueryRow(r.Context(), "SELECT EXISTS(SELECT 1 FROM projects WHERE id=$1)", p).Scan(&exists); e != nil {
		dbError(w, e)
		return
	}

	if !exists {
		fail(w, 404, "not_found", "Tenant not found")
		return
	}

	switch {
	case r.Method == "GET" && id == "":
		rows, e := s.Store.Pool.Query(r.Context(), "SELECT id,name,prefix,created_at,revoked_at FROM api_keys WHERE project_id=$1 ORDER BY created_at DESC", p)
		if e != nil {
			dbError(w, e)
			return
		}
		defer rows.Close()

		out := []store.Object{}

		for rows.Next() {
			var (
				id, name, prefix string
				created          time.Time
				revoked          *time.Time
			)

			if e = rows.Scan(&id, &name, &prefix, &created, &revoked); e != nil {
				dbError(w, e)
				return
			}

			out = append(out, store.Object{"id": id, "name": name, "prefix": prefix, "created_at": created.UTC().Format(time.RFC3339Nano), "revoked_at": revoked})
		}

		if rows.Err() != nil {
			dbError(w, rows.Err())
			return
		}

		write(w, 200, store.Object{"data": out})
	case r.Method == "POST" && id == "":
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

		secret := store.ID("wapo")
		id := store.ID("key")
		prefix := secret[:12]

		_, e = s.Store.Pool.Exec(r.Context(), "INSERT INTO api_keys(hash,project_id,id,name,prefix) VALUES($1,$2,$3,$4,$5)", store.Hash(secret), p, id, name, prefix)
		if e != nil {
			dbError(w, e)
			return
		}

		write(w, 201, store.Object{"data": store.Object{"id": id, "name": name, "prefix": prefix, "key": secret}})
	case r.Method == "DELETE" && id != "":
		tag, e := s.Store.Pool.Exec(r.Context(), "UPDATE api_keys SET revoked_at=COALESCE(revoked_at,now()) WHERE project_id=$1 AND id=$2", p, id)
		if e != nil {
			dbError(w, e)
			return
		}

		if tag.RowsAffected() == 0 {
			fail(w, 404, "not_found", "API key not found")
			return
		}

		write(w, 200, store.Object{"data": store.Object{"id": id, "revoked": true}})
	default:
		fail(w, 405, "method_not_allowed", "Method not supported")
	}
}

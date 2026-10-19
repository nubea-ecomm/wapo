package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgconn"
	"wapo.local/server/internal/store"
)

const projectKey contextKey = "project"

func project(r *http.Request) string { return r.Context().Value(projectKey).(string) }
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if status != 204 {
		json.NewEncoder(w).Encode(v)
	}
}
func fail(w http.ResponseWriter, status int, code, message string) {
	write(w, status, store.Object{"error": store.Object{"code": code, "message": message}})
}
func dbError(w http.ResponseWriter, e error) {
	if errors.Is(e, store.ErrNotFound) {
		fail(w, 404, "not_found", "Resource not found")
		return
	}
	var pe *pgconn.PgError
	if errors.As(e, &pe) && pe.Code == "23505" {
		fail(w, 422, "already_exists", "Resource or external customer ID already exists")
		return
	}
	slog.Error("storage operation failed", "error_type", fmt.Sprintf("%T", e))
	fail(w, 500, "storage_error", "Storage operation failed")
}
func decode(r *http.Request) (store.Object, error) {
	dec := json.NewDecoder(r.Body)
	var o store.Object
	if e := dec.Decode(&o); e != nil {
		return nil, e
	}
	if o == nil {
		return nil, fmt.Errorf("JSON object required")
	}
	var extra any
	if dec.Decode(&extra) != io.EOF {
		return nil, fmt.Errorf("expected exactly one JSON object")
	}
	return o, nil
}
func str(o store.Object, k string) string          { v, _ := o[k].(string); return v }
func object(o store.Object, k string) store.Object { v, _ := o[k].(map[string]any); return v }
func clean(o store.Object) store.Object {
	out := store.Object{}
	for k, v := range o {
		if k != "access_token" && k != "secret_key" && k != "token_hash" && k != "onboarding_token" && k != "registration_pin" {
			out[k] = v
		}
	}
	return out
}

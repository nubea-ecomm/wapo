package api

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) updateSetupLink(w http.ResponseWriter, r *http.Request, customer, id string) {
	input, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}

	if object(input, "setup_link") != nil {
		input = object(input, "setup_link")
	}

	patch, e := s.setupOptions(input)
	if e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}

	if _, ok := input["meta_billing_mode"]; ok {
		fail(w, 422, "immutable_field", "meta_billing_mode cannot change after creation")
		return
	}

	tx, e := s.Store.Pool.Begin(r.Context())
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(context.Background())

	var raw []byte

	e = tx.QueryRow(r.Context(), "SELECT data FROM resources WHERE project_id=$1 AND kind='setup_links' AND id=$2 FOR UPDATE", project(r), id).Scan(&raw)
	if e != nil {
		dbError(w, notFound(e))
		return
	}

	var current store.Object

	if json.Unmarshal(raw, &current) != nil {
		fail(w, 500, "invalid_state", "Cannot read setup link")
		return
	}

	if customer != "" && str(current, "customer_id") != customer {
		fail(w, 404, "not_found", "Setup link not found for this customer")
		return
	}

	if str(current, "status") == "completed" || str(current, "status") == "used" {
		fail(w, 409, "link_used", "Completed setup links cannot be changed")
		return
	}

	if reconnect := str(current, "reconnect_phone_number"); reconnect != "" {
		if _, ok := patch["allowed_connection_types"]; ok {
			fail(w, 422, "immutable_field", "Connection types cannot change on reconnect links")
			return
		}
	}

	for key, value := range patch {
		current[key] = value
	}

	if str(current, "status") == "expired" {
		current["expires_at"] = time.Now().UTC().Format(time.RFC3339Nano)
	}

	raw, _ = json.Marshal(current)
	if _, e = tx.Exec(r.Context(), "UPDATE resources SET data=$3 WHERE project_id=$1 AND kind='setup_links' AND id=$2", project(r), id, raw); e != nil {
		dbError(w, e)
		return
	}

	if e = tx.Commit(r.Context()); e != nil {
		dbError(w, e)
		return
	}

	write(w, 200, store.Object{"data": s.setupLinkOutput(current, project(r))})
}

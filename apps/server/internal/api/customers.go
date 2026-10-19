package api

import (
	"net/http"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) customers(w http.ResponseWriter, r *http.Request, id string, compat bool) {
	p := project(r)
	switch {
	case r.Method == "GET" && id == "":
		s.list(w, r, "customers", map[string]string{"external_customer_id": r.URL.Query().Get("external_customer_id")})
	case r.Method == "GET":
		s.getOnly(w, r, "customers", id)
	case r.Method == "POST" && id == "":
		body, e := decode(r)
		if e != nil {
			fail(w, 400, "invalid_json", "Valid JSON object required")
			return
		}
		if compat {
			body = object(body, "customer")
		}
		if e = validateCustomer(body); e != nil {
			fail(w, 422, "validation_error", e.Error())
			return
		}
		name := str(body, "name")
		if strings.TrimSpace(name) == "" {
			fail(w, 422, "validation_error", "name is required")
			return
		}
		o := store.Object{"id": store.ID("cus"), "name": name, "created_at": time.Now().UTC().Format(time.RFC3339Nano)}
		if ext := str(body, "external_customer_id"); ext != "" {
			o["external_customer_id"] = ext
		}
		for _, field := range []string{"email", "metadata"} {
			if v, ok := body[field]; ok {
				o[field] = v
			}
		}
		if e = s.Store.Put(r.Context(), p, "customers", str(o, "id"), o, true); e != nil {
			dbError(w, e)
			return
		}
		write(w, 201, store.Object{"data": o})
	case r.Method == "PATCH" && id != "":
		o, e := s.Store.Get(r.Context(), p, "customers", id)
		if e != nil {
			dbError(w, e)
			return
		}
		input, e := decode(r)
		if e != nil {
			fail(w, 400, "invalid_json", "Valid JSON object required")
			return
		}
		if compat {
			input = object(input, "customer")
		}
		if e = validateCustomer(input); e != nil {
			fail(w, 422, "validation_error", e.Error())
			return
		}
		for _, k := range []string{"name", "external_customer_id", "email", "metadata"} {
			if v, ok := input[k]; ok {
				if k == "external_customer_id" && v == "" {
					o[k] = nil
				} else {
					o[k] = v
				}
			}
		}
		if strings.TrimSpace(str(o, "name")) == "" {
			fail(w, 422, "validation_error", "name is required")
			return
		}
		if e = s.Store.Put(r.Context(), p, "customers", id, o, false); e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, store.Object{"data": o})
	case r.Method == "DELETE" && id != "":
		rows, _, e := s.Store.List(r.Context(), p, "connections", map[string]string{"customer_id": id}, "", 1)
		if e != nil {
			dbError(w, e)
			return
		}
		if len(rows) > 0 {
			fail(w, 409, "customer_has_connections", "Delete customer connections first")
			return
		}
		if e = s.Store.Delete(r.Context(), p, "customers", id); e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, store.Object{"data": store.Object{"id": id, "deleted": true}})
	default:
		fail(w, 405, "method_not_allowed", "Method not supported")
	}
}

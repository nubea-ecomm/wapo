package api

import (
	"net/http"
	"strings"

	"wapo.local/server/internal/store"
)

func (s *Server) compatPlatform(w http.ResponseWriter, r *http.Request) {
	if s.bridgeEnabled(r) {
		s.bridge(w, r, s.Config.BridgePlatformURL, "/platform/v1/")
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/platform/v1/"), "/"), "/")
	if parts[0] == "customers" {
		if len(parts) == 1 {
			s.customers(w, r, "", true)
			return
		}
		if len(parts) == 2 {
			s.customers(w, r, parts[1], true)
			return
		}
		if len(parts) == 4 && parts[2] == "setup_links" && r.Method == "PATCH" {
			s.updateSetupLink(w, r, parts[1], parts[3])
			return
		}
		if len(parts) == 3 && parts[2] == "setup_links" {
			s.setupLinks(w, r, parts[1], true)
			return
		}

	}
	if len(parts) == 2 && parts[0] == "setup_links" {
		s.manageSetupLink(w, r, parts[1])
		return
	}
	if len(parts) < 2 || parts[0] != "whatsapp" {
		fail(w, 404, "not_found", "Compatibility endpoint not found")
		return
	}
	if parts[1] == "webhooks" && len(parts) <= 3 {
		id := ""
		if len(parts) == 3 {
			id = parts[2]
		}
		s.webhooks(w, r, id, "")
		return
	}
	if parts[1] == "messages" && len(parts) == 3 && r.Method == "GET" {
		record, e := s.Store.Get(r.Context(), project(r), "messages", parts[2])
		if e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, store.Object{"data": s.compatibilityMessage(record)})
		return
	}
	if parts[1] == "media" {
		fail(w, 501, "media_ingest_not_implemented", "URL-to-resumable-asset ingest is not implemented in standalone mode. Upload a sample using Meta and pass its header_handle, or use the optional upstream bridge.")
		return
	}
	if parts[1] == "messages" && len(parts) == 2 && r.Method == "GET" {
		filters := map[string]string{"phone_number_id": r.URL.Query().Get("phone_number_id"), "direction": r.URL.Query().Get("direction"), "status": r.URL.Query().Get("status")}
		rows, next, e := s.Store.List(r.Context(), project(r), "messages", filters, r.URL.Query().Get("after"), pageLimit(r))
		if e != nil {
			if e.Error() == "invalid cursor" {
				fail(w, 400, "invalid_cursor", e.Error())
			} else {
				dbError(w, e)
			}
			return
		}
		for i, msg := range rows {
			rows[i] = s.compatibilityMessage(msg)
		}
		write(w, 200, store.Object{"data": rows, "paging": store.Object{"cursors": store.Object{"after": next}}})
		return
	}
	if parts[1] != "phone_numbers" {
		fail(w, 404, "not_found", "Compatibility endpoint not found")
		return
	}
	if len(parts) == 2 && r.Method == "GET" {
		rows, next, e := s.Store.List(r.Context(), project(r), "connections", map[string]string{"channel": "whatsapp", "customer_id": r.URL.Query().Get("customer_id")}, r.URL.Query().Get("after"), pageLimit(r))
		if e != nil {
			dbError(w, e)
			return
		}
		for i, c := range rows {
			rows[i] = phone(c)
		}
		write(w, 200, store.Object{"data": rows, "paging": store.Object{"cursors": store.Object{"after": next}}})
		return
	}
	if len(parts) < 3 {
		fail(w, 405, "method_not_allowed", "Use GET")
		return
	}
	c, e := s.phoneConnection(r, parts[2])
	if e != nil {
		dbError(w, e)
		return
	}
	if len(parts) >= 4 && parts[3] == "webhooks" {
		id := ""
		if len(parts) == 5 {
			id = parts[4]
		}
		if len(parts) > 5 {
			fail(w, 404, "not_found", "Endpoint not found")
			return
		}
		s.webhooks(w, r, id, str(c, "id"))
		return
	}
	if len(parts) == 4 && parts[3] == "health" && r.Method == "GET" {
		s.connectionHealth(w, r, str(c, "id"))
		return
	}
	if len(parts) != 3 {
		fail(w, 404, "not_found", "Endpoint not found")
		return
	}
	switch r.Method {
	case "GET":
		write(w, 200, store.Object{"data": phone(c)})
	case "DELETE":
		if e = s.Store.Delete(r.Context(), project(r), "connections", str(c, "id")); e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, store.Object{"data": store.Object{"id": parts[2], "deleted": true}})
	case "PATCH":
		o, e := decode(r)
		if e != nil {
			fail(w, 400, "invalid_json", "Valid JSON object required")
			return
		}
		settings := object(o, "whatsapp_phone_number")
		enabled, ok := settings["inbound_processing_enabled"].(bool)
		if !ok || len(settings) != 1 {
			fail(w, 422, "unsupported_setting", "Only inbound_processing_enabled is supported")
			return
		}
		c["inbound_processing_enabled"] = enabled
		if e = s.Store.Put(r.Context(), project(r), "connections", str(c, "id"), c, false); e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, store.Object{"data": phone(c)})
	default:
		fail(w, 405, "method_not_allowed", "Method not supported")
	}
}

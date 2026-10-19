package api

import (
	"net/http"

	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func (s *Server) webhooks(w http.ResponseWriter, r *http.Request, id, connection string) {
	p := project(r)
	if connection != "" {
		if _, e := s.Store.Get(r.Context(), p, "connections", connection); e != nil {
			dbError(w, e)
			return
		}
	}

	if r.Method == "GET" && id == "" {
		s.list(w, r, "webhooks", map[string]string{"connection_id": connection})
		return
	}

	if id != "" && (r.Method == "GET" || r.Method == "PATCH") {
		current, e := s.Store.Get(r.Context(), p, "webhooks", id)
		if e != nil {
			dbError(w, e)
			return
		}

		if connection != "" && str(current, "connection_id") != connection {
			fail(w, 404, "not_found", "Webhook not found")
			return
		}

		if r.Method == "GET" {
			write(w, 200, store.Object{"data": clean(current)})
		} else {
			s.updateWebhook(w, r, current)
		}

		return
	}

	if r.Method == "DELETE" && id != "" {
		o, e := s.Store.Get(r.Context(), p, "webhooks", id)
		if e != nil {
			dbError(w, e)
			return
		}

		if connection != "" && str(o, "connection_id") != connection {
			fail(w, 404, "not_found", "Webhook not found")
			return
		}

		if e = s.Store.Delete(r.Context(), p, "webhooks", id); e != nil {
			dbError(w, e)
			return
		}

		write(w, 200, store.Object{"data": store.Object{"id": id, "deleted": true}})

		return
	}

	if r.Method != "POST" || id != "" {
		fail(w, 405, "method_not_allowed", "Method not supported")
		return
	}

	o, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON object required")
		return
	}

	if wrapped := object(o, "whatsapp_webhook"); wrapped != nil {
		o = wrapped
	}

	if e = delivery.ValidateURL(str(o, "url"), s.Config.AllowPrivateWebhooks); e != nil {
		fail(w, 422, "invalid_url", e.Error())
		return
	}

	if len(str(o, "secret_key")) < 16 {
		fail(w, 422, "validation_error", "secret_key must contain at least 16 characters")
		return
	}

	events, ok := o["events"].([]any)
	if !ok || len(events) == 0 {
		fail(w, 422, "validation_error", "events must be a nonempty string array")
		return
	}

	for _, event := range events {
		v, ok := event.(string)
		if !ok || !validEvent(v) {
			fail(w, 422, "invalid_event", "Unsupported webhook event")
			return
		}
	}

	if connection == "" {
		connection = str(o, "connection_id")
		if connection != "" {
			if _, e = s.Store.Get(r.Context(), p, "connections", connection); e != nil {
				dbError(w, e)
				return
			}
		}
	}

	result := store.Object{"id": store.ID("wh"), "url": str(o, "url"), "secret_key": s.Store.Seal(str(o, "secret_key"), p), "events": events, "connection_id": connection, "active": true}
	if e = s.Store.Put(r.Context(), p, "webhooks", str(result, "id"), result, true); e != nil {
		dbError(w, e)
		return
	}

	write(w, 201, store.Object{"data": clean(result)})
}

func validEvent(v string) bool {
	if methodIn(v, "whatsapp.template.status_changed whatsapp.template.category_changed whatsapp.template.quality_changed whatsapp.template.category_change_scheduled") {
		return true
	}

	for _, state := range []string{"connect", "terminate", "ringing", "accepted", "rejected", "completed", "failed"} {
		if v == "whatsapp.call."+state {
			return true
		}
	}

	if v == "whatsapp.phone_number.created" || v == "whatsapp.phone_number.deleted" || v == "whatsapp.history.received" || v == "whatsapp.contacts.received" || v == "whatsapp.account.updated" {
		return true
	}

	if v == "*" {
		return true
	}

	for _, channel := range []string{"message", "whatsapp.message"} {
		for _, status := range []string{"received", "sent", "delivered", "read", "failed"} {
			if v == channel+"."+status {
				return true
			}
		}
	}

	return false
}

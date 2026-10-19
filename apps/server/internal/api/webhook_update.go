package api

import (
	"net/http"
	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func (s *Server) updateWebhook(w http.ResponseWriter, r *http.Request, current store.Object) {
	input, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON required")
		return
	}
	if wrapped := object(input, "whatsapp_webhook"); wrapped != nil {
		input = wrapped
	}
	patch := store.Object{}
	for key, value := range input {
		switch key {
		case "url":
			text, ok := value.(string)
			if !ok {
				fail(w, 422, "invalid_url", "url must be a string")
				return
			}
			if e = delivery.ValidateURL(text, s.Config.AllowPrivateWebhooks); e != nil {
				fail(w, 422, "invalid_url", e.Error())
				return
			}
			patch[key] = text
		case "active":
			if _, ok := value.(bool); !ok {
				fail(w, 422, "validation_error", "active must be a boolean")
				return
			}
			patch[key] = value
		case "events":
			events, ok := value.([]any)
			if !ok || len(events) == 0 {
				fail(w, 422, "validation_error", "events must be a nonempty array")
				return
			}
			for _, event := range events {
				text, ok := event.(string)
				if !ok || !validEvent(text) {
					fail(w, 422, "invalid_event", "Unsupported webhook event")
					return
				}
			}
			patch[key] = events
		case "secret_key":
			text, ok := value.(string)
			if !ok || len(text) < 16 {
				fail(w, 422, "validation_error", "secret_key must contain at least 16 characters")
				return
			}
			patch[key] = s.Store.Seal(text, project(r))
		default:
			fail(w, 422, "unsupported_setting", "Unsupported webhook setting: "+key)
			return
		}
	}
	updated, e := s.Store.Patch(r.Context(), project(r), "webhooks", str(current, "id"), patch)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, store.Object{"data": clean(updated)})
}

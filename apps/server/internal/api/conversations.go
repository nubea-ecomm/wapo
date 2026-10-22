package api

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) conversations(w http.ResponseWriter, r *http.Request, id, subresource string) {
	if id == "" {
		if r.Method != "GET" {
			fail(w, 405, "method_not_allowed", "Use GET")
			return
		}

		s.listConversations(w, r)

		return
	}

	recipient := ""
	c, e := s.Store.Get(r.Context(), project(r), "conversations", id)

	if errors.Is(e, store.ErrNotFound) {
		if redirect, err := s.Store.Get(r.Context(), project(r), "conversation_redirects", id); err == nil {
			c, e = s.Store.Get(r.Context(), project(r), "conversations", str(redirect, "conversation_id"))
			recipient = str(redirect, "recipient_input")
		} else if !errors.Is(err, store.ErrNotFound) {
			e = err
		}
	}

	if e != nil {
		dbError(w, e)
		return
	}

	if recipient == "" {
		recipient = str(c, "contact")
	}

	if e = s.enrichConversationContacts(r.Context(), project(r), []store.Object{c}); e != nil {
		dbError(w, e)
		return
	}

	if str(c, "channel") == "whatsapp" {
		open, expiresAt, windowErr := s.Store.ServiceWindow(r.Context(), project(r), str(c, "connection_id"), str(c, "contact"))
		if windowErr != nil {
			dbError(w, windowErr)
			return
		}

		c["service_window_open"] = open
		if !expiresAt.IsZero() {
			c["service_window_expires_at"] = expiresAt.Format(time.RFC3339Nano)
		}
	}

	if subresource == "messages" {
		connection, connectionErr := s.Store.Get(r.Context(), project(r), "connections", str(c, "connection_id"))
		if connectionErr != nil {
			dbError(w, connectionErr)
			return
		}

		switch r.Method {
		case "GET":
			s.listConversationMessages(w, r, c, connection)
		case "POST":
			o, e := decode(r)
			if e != nil {
				fail(w, 400, "invalid_json", "Valid JSON required")
				return
			}

			if template := object(o, "template"); template != nil {
				s.send(w, r, connection, store.Object{"to": recipient, "type": "template", "template": template}, false)
				return
			}

			text := strings.TrimSpace(str(o, "text"))
			if text == "" {
				fail(w, 422, "validation_error", "text or template is required")
				return
			}

			s.send(w, r, connection, store.Object{"to": recipient, "type": "text", "text": store.Object{"body": text}}, false)
		default:
			fail(w, 405, "method_not_allowed", "Use GET or POST")
		}

		return
	}

	if subresource != "" {
		fail(w, 404, "not_found", "Endpoint not found")
		return
	}

	switch r.Method {
	case "GET":
		write(w, 200, store.Object{"data": c})
	case "PATCH":
		o, e := decode(r)
		if e != nil {
			fail(w, 400, "invalid_json", "Valid JSON required")
			return
		}

		patch := store.Object{}

		if status := str(o, "status"); status != "" {
			if status != "open" && status != "closed" {
				fail(w, 422, "validation_error", "status must be open or closed")
				return
			}

			patch["status"] = status
		}

		if assignee, ok := o["assigned_to"].(string); ok {
			if len(assignee) > 120 {
				fail(w, 422, "validation_error", "assigned_to exceeds 120 characters")
				return
			}

			patch["assigned_to"] = assignee
		}

		if c, e = s.Store.Patch(r.Context(), project(r), "conversations", str(c, "id"), patch); e != nil {
			dbError(w, e)
			return
		}

		write(w, 200, store.Object{"data": c})
	default:
		fail(w, 405, "method_not_allowed", "Use GET or PATCH")
	}
}

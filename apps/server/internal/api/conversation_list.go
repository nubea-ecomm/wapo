package api

import (
	"net/http"

	"wapo.local/server/internal/store"
)

func (s *Server) listConversations(w http.ResponseWriter, r *http.Request) {
	filters := map[string]string{
		"connection_id": r.URL.Query().Get("connection_id"),
		"customer_id":   r.URL.Query().Get("customer_id"),
		"status":        r.URL.Query().Get("status"),
		"channel":       s.Config.ChannelFilter(),
	}

	rows, next, err := s.Store.List(r.Context(), project(r), "conversations", filters, r.URL.Query().Get("after"), pageLimit(r))
	if err != nil {
		if err.Error() == "invalid cursor" {
			fail(w, 400, "invalid_cursor", err.Error())
		} else {
			dbError(w, err)
		}

		return
	}

	connections := map[string]store.Object{}

	if err = s.enrichConversationContacts(r.Context(), project(r), rows); err != nil {
		dbError(w, err)
		return
	}

	for _, conversation := range rows {
		message := object(conversation, "last_message")
		if str(message, "display_text") != "" || str(object(message, "payload"), "type") != "template" {
			continue
		}

		connectionID := str(conversation, "connection_id")
		connection := connections[connectionID]

		if connection == nil {
			connection, err = s.Store.Get(r.Context(), project(r), "connections", connectionID)
			if err != nil {
				continue
			}

			connections[connectionID] = connection
		}

		if rendered := s.renderTemplateMessage(r.Context(), project(r), connection, message); rendered != "" {
			message["display_text"] = rendered
			conversation["last_message"] = message
		}
	}

	write(w, 200, store.Object{"data": rows, "meta": store.Object{"has_more": next != "", "after": next}, "paging": store.Object{"cursors": store.Object{"after": next}}})
}

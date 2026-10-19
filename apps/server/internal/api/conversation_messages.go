package api

import (
	"net/http"

	"wapo.local/server/internal/store"
)

func (s *Server) listConversationMessages(w http.ResponseWriter, r *http.Request, conversation store.Object, connection store.Object) {
	rows, next, err := s.Store.List(r.Context(), project(r), "messages", map[string]string{"conversation_id": str(conversation, "id")}, r.URL.Query().Get("after"), pageLimit(r))
	if err != nil {
		if err.Error() == "invalid cursor" {
			fail(w, 400, "invalid_cursor", err.Error())
		} else {
			dbError(w, err)
		}

		return
	}

	for _, message := range rows {
		if str(message, "display_text") == "" {
			if rendered := s.renderTemplateMessage(r.Context(), project(r), connection, message); rendered != "" {
				message["display_text"] = rendered
			}
		}
	}

	write(w, 200, store.Object{"data": rows, "meta": store.Object{"has_more": next != "", "after": next}, "paging": store.Object{"cursors": store.Object{"after": next}}})
}

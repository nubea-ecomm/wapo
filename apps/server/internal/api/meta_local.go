package api

import (
	"context"
	"net/http"
	"strings"
	"wapo.local/server/internal/store"
)

func (s *Server) localMetaData(w http.ResponseWriter, r *http.Request, c store.Object, parts []string) bool {
	edge := parts[2]
	id := ""
	if len(parts) == 4 {
		id = parts[3]
	}
	if (edge == "messages" || edge == "marketing_messages") && r.Method == "POST" && len(parts) == 3 {
		input, e := decode(r)
		if e != nil {
			fail(w, 400, "invalid_json", "Valid JSON required")
			return true
		}
		if edge == "messages" && str(input, "status") == "read" {
			message, e := s.Store.Get(r.Context(), project(r), "messages", str(input, "message_id"))
			if e != nil || str(message, "connection_id") != str(c, "id") {
				fail(w, 404, "not_found", "Message not found")
				return true
			}
			s.relayMeta(w, r.WithContext(context.WithValue(r.Context(), metaBodyKey, input)), c, parts[0]+"/"+parts[1]+"/messages", "")
			return true
		}
		if edge == "marketing_messages" && str(input, "recipient") != "" {
			input["to"] = input["recipient"]
		}
		s.send(w, r, c, input, true)
		return true
	}
	if r.Method != "GET" || !methodIn(edge, "messages conversations contacts calls") {
		return false
	}
	kind := edge
	if edge == "contacts" {
		if id != "" {
			contact, e := s.Store.Get(r.Context(), project(r), "contacts", store.ConversationID(str(c, "id"), id))
			if e != nil {
				dbError(w, e)
				return true
			}
			write(w, 200, contact)
			return true
		}
	}
	filters := map[string]string{"connection_id": str(c, "id")}
	for _, key := range []string{"direction", "status", "call_id", "wa_id"} {
		if value := r.URL.Query().Get(key); value != "" {
			filters[key] = value
		}
	}
	if id != "" {
		record, e := s.Store.Get(r.Context(), project(r), kind, id)
		if e != nil {
			dbError(w, e)
			return true
		}
		if str(record, "connection_id") != str(c, "id") {
			fail(w, 404, "not_found", "Resource not found")
			return true
		}
		if edge == "messages" {
			record = s.compatibilityMessage(record)
		} else if edge == "conversations" {
			record = compatConversation(record, c)
		}
		write(w, 200, record)
		return true
	}
	rows, next, e := s.Store.List(r.Context(), project(r), kind, filters, r.URL.Query().Get("after"), pageLimit(r))
	if e != nil {
		dbError(w, e)
		return true
	}
	for i, record := range rows {
		if edge == "messages" {
			rows[i] = s.compatibilityMessage(record)
		} else if edge == "conversations" {
			rows[i] = compatConversation(record, c)
		}
	}
	write(w, 200, store.Object{"data": rows, "paging": store.Object{"cursors": store.Object{"after": next}}})
	return true
}

const metaBodyKey contextKey = "meta-body"

func compatConversation(record, c store.Object) store.Object {
	copy := clean(record)
	copy["phone_number"] = record["contact"]
	copy["phone_number_id"] = c["external_id"]
	copy["last_active_at"] = record["updated_at"]
	if strings.EqualFold(str(record, "status"), "open") {
		copy["status"] = "active"
	}
	return copy
}

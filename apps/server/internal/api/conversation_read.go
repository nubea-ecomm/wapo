package api

import (
	"net/http"

	"wapo.local/server/internal/store"
)

func conversationReader(r *http.Request) string {
	if user, ok := r.Context().Value(consoleUserKey).(store.ConsoleUser); ok {
		return "user:" + user.ID
	}

	return "key:" + store.Hash(credential(r))
}

func (s *Server) enrichConversationReads(r *http.Request, conversations []store.Object) error {
	ids := make([]string, 0, len(conversations))
	for _, conversation := range conversations {
		ids = append(ids, str(conversation, "id"))
		conversation["has_unread"] = false
	}

	rows, err := s.Store.Pool.Query(r.Context(), `SELECT c.id,m.id,
		COALESCE((m.created_at,m.id)>(seen.last_read_at,seen.last_read_message_id),m.id IS NOT NULL)
		FROM resources c LEFT JOIN LATERAL (
		 SELECT id,created_at FROM resources WHERE project_id=c.project_id AND kind='messages'
		 AND data->>'conversation_id'=c.id AND data->>'direction'='inbound'
		 ORDER BY created_at DESC,id DESC LIMIT 1
		) m ON true LEFT JOIN conversation_reads seen ON seen.project_id=c.project_id
		AND seen.conversation_id=c.id AND seen.reader_id=$3
		WHERE c.project_id=$1 AND c.kind='conversations' AND c.id=ANY($2)`, project(r), ids, conversationReader(r))
	if err != nil {
		return err
	}
	defer rows.Close()

	byID := map[string]store.Object{}
	for _, conversation := range conversations {
		byID[str(conversation, "id")] = conversation
	}

	for rows.Next() {
		var (
			id      string
			message *string
			unread  bool
		)

		if err = rows.Scan(&id, &message, &unread); err != nil {
			return err
		}

		byID[id]["has_unread"] = unread
		if message != nil {
			byID[id]["last_inbound_message_id"] = *message
		}
	}

	return rows.Err()
}

func (s *Server) markConversationRead(w http.ResponseWriter, r *http.Request, conversation store.Object) {
	if r.Method != http.MethodPost {
		fail(w, 405, "method_not_allowed", "Use POST")
		return
	}

	body, err := decode(r)
	if err != nil || str(body, "message_id") == "" {
		fail(w, 422, "validation_error", "message_id is required")
		return
	}

	// Use the last inbound actually displayed, not now(): an incoming message
	// racing this request must remain unread. Repeated/older marks are harmless.
	result, err := s.Store.Pool.Exec(r.Context(), `INSERT INTO conversation_reads(project_id,conversation_id,reader_id,last_read_at,last_read_message_id)
	 SELECT project_id,$2,$3,created_at,id FROM resources WHERE project_id=$1 AND kind='messages'
	 AND id=$4 AND data->>'conversation_id'=$2 AND data->>'direction'='inbound'
	 ON CONFLICT(project_id,conversation_id,reader_id) DO UPDATE
	 SET last_read_at=EXCLUDED.last_read_at,last_read_message_id=EXCLUDED.last_read_message_id
	 WHERE (EXCLUDED.last_read_at,EXCLUDED.last_read_message_id)>(conversation_reads.last_read_at,conversation_reads.last_read_message_id)`, project(r), str(conversation, "id"), conversationReader(r), str(body, "message_id"))
	if err != nil {
		dbError(w, err)
		return
	}

	if result.RowsAffected() == 0 {
		message, e := s.Store.Get(r.Context(), project(r), "messages", str(body, "message_id"))
		if e != nil || str(message, "conversation_id") != str(conversation, "id") || str(message, "direction") != "inbound" {
			fail(w, 404, "not_found", "Inbound message not found in this conversation")
			return
		}
	}

	if err = s.enrichConversationReads(r, []store.Object{conversation}); err != nil {
		dbError(w, err)
		return
	}

	write(w, 200, store.Object{"data": conversation})
}

package api

import (
	"encoding/json"
	"net/http"

	"wapo.local/server/internal/store"
)

func (s *Server) enrichMessageRelations(r *http.Request, conversation, connection string, messages []store.Object) error {
	ids, quoted := []string{}, []string{}
	byID := map[string]store.Object{}

	for _, message := range messages {
		id := str(message, "id")
		ids = append(ids, id)
		byID[id] = message
		message["reactions"] = []store.Object{}

		if parent := str(object(object(message, "payload"), "context"), "id"); parent != "" {
			quoted = append(quoted, parent)
			message["reply_to"] = store.Object{"message_id": parent, "unavailable": true}
		} else if parent := str(object(object(message, "payload"), "context"), "message_id"); parent != "" {
			quoted = append(quoted, parent)
			message["reply_to"] = store.Object{"message_id": parent, "unavailable": true}
		}
	}

	rows, err := s.Store.Pool.Query(r.Context(), `SELECT DISTINCT ON (data->'payload'->'reaction'->>'message_id',data->>'reaction_actor') data
	 FROM resources WHERE project_id=$1 AND kind='messages' AND data->>'connection_id'=$2
	 AND data->'payload'->>'type'='reaction' AND data->'payload'->'reaction'->>'message_id'=ANY($3)
	 AND data->>'status' IS DISTINCT FROM 'failed'
	 ORDER BY data->'payload'->'reaction'->>'message_id',data->>'reaction_actor',
	 (data->>'reaction_at')::timestamptz DESC NULLS LAST,(coalesce(data->'payload'->'reaction'->>'emoji','')='') DESC,created_at DESC,id DESC`, project(r), connection, ids)
	if err != nil {
		return err
	}

	for rows.Next() {
		var raw []byte

		if err = rows.Scan(&raw); err != nil {
			rows.Close()
			return err
		}

		var message store.Object

		if err = json.Unmarshal(raw, &message); err != nil {
			rows.Close()
			return err
		}

		reaction := object(object(message, "payload"), "reaction")
		if emoji := str(reaction, "emoji"); emoji != "" {
			target := byID[str(reaction, "message_id")]
			if target != nil {
				target["reactions"] = append(target["reactions"].([]store.Object), store.Object{"emoji": emoji, "actor": message["reaction_actor"], "direction": message["direction"], "message_id": message["id"], "status": message["status"]})
			}
		}
	}

	err = rows.Err()
	rows.Close()

	if err != nil || len(quoted) == 0 {
		return err
	}

	rows, err = s.Store.Pool.Query(r.Context(), `SELECT data FROM resources WHERE project_id=$1 AND kind='messages' AND data->>'connection_id'=$2 AND data->>'conversation_id'=$3 AND id=ANY($4) AND data->'payload'->>'type' IS DISTINCT FROM 'reaction'`, project(r), connection, conversation, quoted)
	if err != nil {
		return err
	}
	defer rows.Close()

	parents := map[string]store.Object{}

	for rows.Next() {
		var raw []byte

		if err = rows.Scan(&raw); err != nil {
			return err
		}

		var parent store.Object

		if err = json.Unmarshal(raw, &parent); err != nil {
			return err
		}

		parents[str(parent, "id")] = parent
	}

	for _, message := range messages {
		reference := object(message, "reply_to")
		if parent := parents[str(reference, "message_id")]; parent != nil {
			message["reply_to"] = store.Object{"message_id": parent["id"], "direction": parent["direction"], "payload": parent["payload"], "display_text": parent["display_text"], "unavailable": false}
		}
	}

	return rows.Err()
}

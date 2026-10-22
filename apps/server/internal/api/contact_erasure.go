package api

import (
	"net/http"
)

func (s *Server) eraseContact(w http.ResponseWriter, r *http.Request, id string) {
	tx, err := s.Store.Pool.Begin(r.Context())
	if err != nil {
		dbError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	var connection, waID string

	if err = tx.QueryRow(r.Context(), "SELECT connection_id,wa_id FROM contacts WHERE project_id=$1 AND id=$2 FOR UPDATE", project(r), id).Scan(&connection, &waID); err != nil {
		dbError(w, notFound(err))
		return
	}

	condition := `(payload#>>'{data,message,to}'=$3 OR payload#>>'{data,message,from}'=$3 OR payload#>>'{data,to}'=$3 OR payload#>>'{data,from}'=$3 OR payload#>>'{contact,id}'=$2 OR payload#>>'{contact,wa_id}'=$3 OR coalesce(payload#>>'{data,message_id}',payload#>>'{data,id}') IN (SELECT id FROM resources WHERE project_id=$1 AND kind='messages' AND data->>'conversation_id'=$2))`
	if _, err = tx.Exec(r.Context(), `DELETE FROM deliveries WHERE event_id IN (SELECT id FROM events WHERE project_id=$1 AND `+condition+`)`, project(r), id, waID); err == nil {
		_, err = tx.Exec(r.Context(), `DELETE FROM events WHERE project_id=$1 AND `+condition, project(r), id, waID)
	}

	if err == nil {
		_, err = tx.Exec(r.Context(), "DELETE FROM requests WHERE project_id=$1 AND (response#>>'{data,to}'=$2 OR response#>>'{data,from}'=$2 OR response#>>'{data,conversation_id}'=$3)", project(r), waID, id)
	}

	if err == nil {
		_, err = tx.Exec(r.Context(), `DELETE FROM resources asset WHERE asset.project_id=$1 AND asset.kind='meta_assets' AND asset.data->>'connection_id'=$2 AND asset.id IN (
			SELECT 'media:'||media_id FROM (
				SELECT coalesce(data#>>'{payload,image,id}',data#>>'{payload,video,id}',data#>>'{payload,audio,id}',data#>>'{payload,document,id}',data#>>'{payload,sticker,id}') media_id
				FROM resources WHERE project_id=$1 AND kind='messages' AND data->>'connection_id'=$2 AND (data->>'to'=$3 OR data->>'from'=$3 OR data->>'conversation_id'=$4)
			) media WHERE media_id IS NOT NULL
		)`, project(r), connection, waID, id)
	}

	if err == nil {
		_, err = tx.Exec(r.Context(), "DELETE FROM resources WHERE project_id=$1 AND ((kind='messages' AND data->>'connection_id'=$2 AND (data->>'to'=$3 OR data->>'from'=$3 OR data->>'conversation_id'=$4)) OR (kind='conversations' AND id=$4))", project(r), connection, waID, id)
	}

	if err == nil {
		_, err = tx.Exec(r.Context(), "DELETE FROM resources WHERE project_id=$1 AND kind='calls' AND data->>'connection_id'=$2 AND data->>'wa_id'=$3", project(r), connection, waID)
	}

	if err == nil {
		_, err = tx.Exec(r.Context(), "DELETE FROM resources WHERE project_id=$1 AND kind='contacts' AND id=$2", project(r), id)
	}

	if err != nil {
		dbError(w, err)
		return
	}

	if err = tx.Commit(r.Context()); err != nil {
		dbError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

package store

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// Reconcile only a provider-confirmed alias. Historical payloads and contact
// customizations remain intact; the inbox history follows the WhatsApp identity.
func reconcileRecipientConversation(ctx context.Context, tx pgx.Tx, project, connection, input, identity string) error {
	if input == "" || identity == "" || input == identity {
		return nil
	}

	oldID, newID := ConversationID(connection, input), ConversationID(connection, identity)

	_, err := tx.Exec(ctx, `INSERT INTO resources(project_id,kind,id,data)
		SELECT project_id,kind,$3,data||jsonb_build_object('id',$3::text,'contact',$4::text)
		FROM resources WHERE project_id=$1 AND kind='conversations' AND id=$2
		ON CONFLICT(project_id,kind,id) DO UPDATE SET data=resources.data
		||CASE WHEN coalesce(NULLIF(EXCLUDED.data->>'service_window_expires_at','')::timestamptz,'-infinity'::timestamptz)>coalesce(NULLIF(resources.data->>'service_window_expires_at','')::timestamptz,'-infinity'::timestamptz)
		THEN jsonb_build_object('service_window_expires_at',EXCLUDED.data->'service_window_expires_at') ELSE '{}'::jsonb END`, project, oldID, newID, identity)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `UPDATE resources SET data=data||jsonb_build_object('conversation_id',$4::text)
		WHERE project_id=$1 AND kind='messages' AND data->>'connection_id'=$2 AND data->>'conversation_id'=$3`, project, connection, oldID, newID)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `INSERT INTO resources(project_id,kind,id,data)
		VALUES($1,'conversation_redirects',$2,jsonb_build_object('id',$2::text,'conversation_id',$3::text,'connection_id',$4::text,'recipient_input',$5::text))
		ON CONFLICT(project_id,kind,id) DO UPDATE SET data=EXCLUDED.data`, project, oldID, newID, connection, input)
	if err != nil {
		return err
	}

	_, err = tx.Exec(ctx, `DELETE FROM resources WHERE project_id=$1 AND kind='conversations' AND id=$2`, project, oldID)

	return err
}

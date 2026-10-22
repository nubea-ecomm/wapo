package store

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/jackc/pgx/v5"
)

func saveReaction(ctx context.Context, tx pgx.Tx, p string, msg Object) error {
	payload, _ := msg["payload"].(map[string]any)
	reaction, _ := payload["reaction"].(map[string]any)
	target, _ := reaction["message_id"].(string)
	connection, _ := msg["connection_id"].(string)
	contact, _ := msg["to"].(string)
	actor := "business"

	if msg["direction"] == "inbound" {
		contact, _ = msg["from"].(string)
		actor = "contact"
	}

	if target == "" || contact == "" {
		return nil
	}

	at := time.Now().UTC()
	timestamp, _ := msg["timestamp"].(string)

	if unix, err := strconv.ParseInt(timestamp, 10, 64); err == nil && unix > 0 {
		at = time.Unix(unix, 0).UTC()
	} else if parsed, err := time.Parse(time.RFC3339Nano, timestamp); err == nil {
		at = parsed.UTC()
	}

	msg["reaction_at"] = at.Format(time.RFC3339Nano)
	msg["reaction_actor"] = actor
	msg["conversation_id"] = ConversationID(connection, contact)

	var conversation string

	err := tx.QueryRow(ctx, `SELECT data->>'conversation_id' FROM resources WHERE project_id=$1 AND kind='messages' AND id=$2 AND data->>'connection_id'=$3 AND data ? 'conversation_id'`, p, target, connection).Scan(&conversation)
	if err == nil {
		msg["conversation_id"] = conversation
	} else if err != pgx.ErrNoRows {
		return err
	}

	raw, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	// A tombstone wins timestamp ties; late delivery must not resurrect removals.
	_, err = tx.Exec(ctx, `INSERT INTO resources(project_id,kind,id,data) VALUES($1,'messages',$2,$3)
	 ON CONFLICT(project_id,kind,id) DO UPDATE SET data=EXCLUDED.data||jsonb_build_object(
	 'status',coalesce(resources.data->'status',EXCLUDED.data->'status'),'statuses',resources.data->'statuses')
	 WHERE coalesce(NULLIF(resources.data->>'reaction_at','')::timestamptz,'-infinity') < (EXCLUDED.data->>'reaction_at')::timestamptz
	 OR ((resources.data->>'reaction_at')::timestamptz=(EXCLUDED.data->>'reaction_at')::timestamptz AND
	 (coalesce(resources.data->'payload'->'reaction'->>'emoji','')<>'' OR coalesce(EXCLUDED.data->'payload'->'reaction'->>'emoji','')=''))`, p, msg["id"], raw)

	return err
}

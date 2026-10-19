package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5"
)

func ConversationID(connection, contact string) string {
	return "conv_" + Hash(connection + "\x00" + contact)[:32]
}
func SaveMessage(ctx context.Context, tx pgx.Tx, p string, msg Object) error {
	contact, _ := msg["to"].(string)
	if msg["direction"] == "inbound" {
		contact, _ = msg["from"].(string)
	}
	connection, _ := msg["connection_id"].(string)
	contactRecord := Object{"id": ConversationID(connection, contact), "wa_id": contact, "phone_number": contact, "connection_id": connection, "profile_name": msg["contact_name"], "display_name": msg["contact_name"], "updated_at": time.Now().UTC().Format(time.RFC3339Nano)}
	contactJSON, _ := json.Marshal(contactRecord)
	if _, e := tx.Exec(ctx, `INSERT INTO resources(project_id,kind,id,data) VALUES($1,'contacts',$2,$3) ON CONFLICT(project_id,kind,id) DO UPDATE SET data=resources.data||jsonb_build_object('profile_name',COALESCE(NULLIF(EXCLUDED.data->'profile_name','null'::jsonb),resources.data->'profile_name'),'updated_at',EXCLUDED.data->'updated_at')`, p, ConversationID(connection, contact), contactJSON); e != nil {
		return e
	}
	if payload, ok := msg["payload"].(map[string]any); ok {
		for _, kind := range []string{"image", "video", "audio", "document", "sticker"} {
			asset, _ := payload[kind].(map[string]any)
			id, _ := asset["id"].(string)
			if id != "" {
				raw, _ := json.Marshal(Object{"id": id, "kind": "media", "connection_id": connection})
				if _, e := tx.Exec(ctx, `INSERT INTO resources(project_id,kind,id,data) VALUES($1,'meta_assets',$2,$3) ON CONFLICT(project_id,kind,id) DO UPDATE SET data=EXCLUDED.data`, p, "media:"+id, raw); e != nil {
					return e
				}
			}
		}
	}

	conversation := ConversationID(connection, contact)
	msg["conversation_id"] = conversation
	now := time.Now().UTC().Format(time.RFC3339Nano)
	summary := Object{"id": conversation, "connection_id": connection, "channel": msg["channel"], "contact": contact, "contact_name": msg["contact_name"], "status": "open", "assigned_to": "", "last_message": msg, "updated_at": now, "created_at": now}
	b, e := json.Marshal(summary)
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, `INSERT INTO resources(project_id,kind,id,data) VALUES($1,'conversations',$2,$3) ON CONFLICT(project_id,kind,id) DO UPDATE SET created_at=now(),data=resources.data||jsonb_build_object('last_message',EXCLUDED.data->'last_message','updated_at',EXCLUDED.data->'updated_at','contact_name',COALESCE(NULLIF(EXCLUDED.data->'contact_name','null'::jsonb),resources.data->'contact_name'))`, p, conversation, b)
	if e != nil {
		return e
	}
	b, e = json.Marshal(msg)
	if e != nil {
		return e
	}
	_, e = tx.Exec(ctx, `INSERT INTO resources(project_id,kind,id,data) VALUES($1,'messages',$2,$3) ON CONFLICT(project_id,kind,id) DO UPDATE SET data=EXCLUDED.data||jsonb_build_object('status',resources.data->'status','statuses',resources.data->'statuses')`, p, msg["id"], b)
	return e
}

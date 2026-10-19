package api

import (
	"encoding/json"
	"net/http"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

// Coexistence history/contact snapshots stay lossless in the event log; echo messages also enter history.
func (s *Server) receiveCoexistence(r *http.Request, p string, raw []byte) error {
	var body struct {
		Entry []struct {
			ID      string `json:"id"`
			Changes []struct {
				Field string       `json:"field"`
				Value store.Object `json:"value"`
			} `json:"changes"`
		} `json:"entry"`
	}
	if e := json.Unmarshal(raw, &body); e != nil {
		return e
	}
	for _, entry := range body.Entry {
		for _, change := range entry.Changes {
			field := change.Field
			if field != "smb_message_echoes" && field != "history" && field != "smb_app_state_sync" && field != "account_update" {
				continue
			}
			phone := str(object(change.Value, "metadata"), "phone_number_id")
			filter := map[string]string{"channel": "whatsapp"}
			if phone != "" {
				filter["external_id"] = phone
			} else {
				filter["business_account_id"] = entry.ID
			}
			rows, _, e := s.Store.List(r.Context(), p, "connections", filter, "", 100)
			if e != nil {
				return e
			}
			if len(rows) == 0 {
				continue
			}
			for _, c := range rows {
				if field == "smb_message_echoes" {
					echoes, _ := change.Value["message_echoes"].([]any)
					for _, value := range echoes {
						message, ok := value.(map[string]any)
						if !ok || str(message, "id") == "" {
							continue
						}
						id := str(message, "id")
						msg := store.Object{"id": id, "connection_id": str(c, "id"), "channel": "whatsapp", "phone_number_id": str(c, "external_id"), "direction": "outbound", "status": "sent", "from": str(message, "from"), "to": str(message, "to"), "timestamp": str(message, "timestamp"), "payload": message, "source": "business_app"}
						event := s.compatibilityEvent("whatsapp.message.sent", c, msg, nil)
						e = delivery.Record(r.Context(), s.Store, p, "echo:"+id, "whatsapp.message.sent", event, str(c, "id"), func(tx pgx.Tx) error {
							return store.SaveMessage(r.Context(), tx, p, msg)
						})
						if e != nil {
							return e
						}
					}
					continue
				}
				name := map[string]string{"history": "whatsapp.history.received", "smb_app_state_sync": "whatsapp.contacts.received", "account_update": "whatsapp.account.updated"}[field]
				payload := store.Object{"event": name, "phone_number_id": c["external_id"], "customer": store.Object{"id": c["customer_id"]}, "data": change.Value}
				b, _ := json.Marshal(payload)
				if e = delivery.Record(r.Context(), s.Store, p, field+":"+str(c, "id")+":"+store.Hash(string(b)), name, payload, str(c, "id"), nil); e != nil {
					return e
				}
			}
		}
	}
	return nil
}

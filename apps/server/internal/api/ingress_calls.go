package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func (s *Server) receiveCalls(r *http.Request, p string, c store.Object, calls []store.Object) error {
	for _, call := range calls {
		id := str(call, "id")
		if id == "" {
			continue
		}

		state := str(call, "event")
		if state == "" {
			state = str(call, "status")
		}

		if state == "" {
			continue
		}

		event := store.Object{"event": "whatsapp.call." + state, "phone_number_id": c["external_id"], "data": call}

		err := delivery.Record(r.Context(), s.Store, p, "call:"+id+":"+state+":"+str(call, "timestamp"), "whatsapp.call."+state, event, str(c, "id"), func(tx pgx.Tx) error {
			record := store.Object{"id": id, "call_id": id, "connection_id": c["id"], "phone_number_id": c["external_id"], "status": state, "direction": call["direction"], "from": call["from"], "to": call["to"], "timestamp": call["timestamp"], "payload": call, "updated_at": time.Now().UTC().Format(time.RFC3339Nano)}
			raw, _ := json.Marshal(record)
			_, e := tx.Exec(r.Context(), "INSERT INTO resources(project_id,kind,id,data) VALUES($1,'calls',$2,$3) ON CONFLICT(project_id,kind,id) DO UPDATE SET data=EXCLUDED.data", p, id, raw)

			return e
		})
		if err != nil {
			return err
		}
	}

	return nil
}

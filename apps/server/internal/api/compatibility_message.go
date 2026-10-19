package api

import (
	"encoding/json"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) compatibilityMessage(msg store.Object) store.Object {
	payload := object(msg, "payload")
	o := store.Object{}

	for k, v := range payload {
		o[k] = v
	}

	o["id"] = msg["id"]
	o["to"] = msg["to"]
	o["from"] = msg["from"]

	if t, e := time.Parse(time.RFC3339Nano, str(msg, "timestamp")); e == nil {
		o["timestamp"] = strings.TrimSpace(jsonNumber(t.Unix()))
	} else {
		o["timestamp"] = msg["timestamp"]
	}

	contact := str(msg, "to")
	if str(msg, "direction") == "inbound" {
		contact = str(msg, "from")
	}

	o["compatibility"] = store.Object{"direction": msg["direction"], "status": msg["status"], "phone_number_id": msg["phone_number_id"], "contact_phone_number": contact, "contact_name": msg["contact_name"], "content": str(object(payload, "text"), "body"), "statuses": msg["statuses"]}

	return o
}
func jsonNumber(n int64) string { b, _ := json.Marshal(n); return string(b) }
func (s *Server) compatibilityEvent(name string, c, msg store.Object, errs any) store.Object {
	data := store.Object{"message_id": msg["id"], "message": s.compatibilityMessage(msg)}
	if list, ok := errs.([]any); ok && len(list) > 0 {
		data["error"] = list[0]
	}

	return store.Object{"event": name, "phone_number_id": str(c, "external_id"), "data": data}
}

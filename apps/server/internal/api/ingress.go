package api

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func (s *Server) verifyMeta(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if s.Config.MetaVerifyToken == "" || q.Get("hub.mode") != "subscribe" || subtle.ConstantTimeCompare([]byte(q.Get("hub.verify_token")), []byte(s.Config.MetaVerifyToken)) != 1 {
		fail(w, 403, "verification_failed", "Invalid verification token")
		return
	}

	if p := r.PathValue("project"); p != "" {
		if e := s.Store.Put(r.Context(), p, "meta_webhook_verification", "current", store.Object{"id": "current", "verified_at": time.Now().UTC().Format(time.RFC3339Nano)}, false); e != nil {
			dbError(w, e)
			return
		}
	} else if e := s.recordGlobalMetaVerification(r.Context()); e != nil {
		dbError(w, e)
		return
	}

	w.Header().Set("Content-Type", "text/plain")
	io.WriteString(w, q.Get("hub.challenge"))
}

func (s *Server) receiveMeta(w http.ResponseWriter, r *http.Request) {
	raw, e := io.ReadAll(r.Body)
	if e != nil {
		fail(w, 413, "body_too_large", "Request body exceeds limit")
		return
	}

	signature := strings.TrimPrefix(r.Header.Get("X-Hub-Signature-256"), "sha256=")
	if !delivery.Verify(raw, s.Config.MetaAppSecret, signature) {
		fail(w, 401, "invalid_signature", "Invalid Meta signature")
		return
	}

	// Validate message shapes before resolving or processing any project in a batch.
	var body metaMessageEnvelope

	if json.Unmarshal(raw, &body) != nil {
		fail(w, 400, "invalid_json", "Valid Meta JSON required")
		return
	}

	p := r.PathValue("project")
	if p == "" {
		e = s.routeMetaWebhook(r, raw)
	} else {
		e = s.processMetaWebhook(r, p, raw)
	}

	if errors.Is(e, errMetaOwnership) {
		fail(w, 400, "ownership_mismatch", "Meta account and phone ownership do not match")
		return
	}

	if errors.Is(e, errMetaEnvelope) {
		fail(w, 400, "invalid_json", "Valid Meta webhook envelope required")
		return
	}

	if e != nil {
		dbError(w, e)
		return
	}

	write(w, 200, store.Object{"received": true})
}

func (s *Server) processMetaWebhook(r *http.Request, p string, raw []byte) error {
	var body metaMessageEnvelope

	if e := json.Unmarshal(raw, &body); e != nil {
		return e
	}

	for _, entry := range body.Entry {
		for _, change := range entry.Changes {
			v := change.Value
			if v.Metadata.PhoneID == "" {
				continue
			}

			rows, _, e := s.Store.List(r.Context(), p, "connections", map[string]string{"channel": "whatsapp", "external_id": v.Metadata.PhoneID}, "", 1)
			if e != nil {
				return e
			}

			if len(rows) == 0 {
				continue
			}

			c := rows[0]

			for index, preference := range v.UserPreferences {
				waID, status, detail, occurredAt, valid := parseMarketingPreference(preference)
				if !valid {
					continue
				}

				sourceKey := fmt.Sprintf("marketing-preference:%s:%s:%s:%d", v.Metadata.PhoneID, waID, occurredAt.Format(time.RFC3339Nano), index)
				if e = s.recordMarketingPreference(r.Context(), p, c, waID, "", status, detail, "meta_webhook", sourceKey, occurredAt); e != nil {
					return e
				}
			}

			if e = s.receiveCalls(r, p, c, v.Calls); e != nil {
				return e
			}

			for _, message := range v.Messages {
				id := str(message, "id")
				if id == "" || c["inbound_processing_enabled"] == false {
					continue
				}

				contactName := ""

				for _, contact := range v.Contacts {
					if contact.WAID == str(message, "from") {
						contactName = contact.Profile.Name
					}
				}

				msg := store.Object{"id": id, "connection_id": str(c, "id"), "channel": "whatsapp", "phone_number_id": v.Metadata.PhoneID, "direction": "inbound", "status": "received", "from": str(message, "from"), "contact_name": contactName, "timestamp": str(message, "timestamp"), "payload": message}
				event := s.compatibilityEvent("whatsapp.message.received", c, msg, nil)

				e = delivery.Record(r.Context(), s.Store, p, "inbound:"+id, "whatsapp.message.received", event, str(c, "id"), func(tx pgx.Tx) error {
					return store.SaveMessage(r.Context(), tx, p, msg)
				})
				if e != nil {
					return e
				}
			}

			for _, status := range v.Statuses {
				id := str(status, "id")
				state := str(status, "status")

				if id == "" || !validDeliveryStatus(state) {
					continue
				}

				msg := store.Object{"id": id, "connection_id": str(c, "id"), "phone_number_id": v.Metadata.PhoneID, "direction": "outbound", "channel": "whatsapp", "to": str(status, "recipient_id"), "status": state, "timestamp": str(status, "timestamp"), "statuses": []any{status}, "payload": store.Object{}}
				name := "whatsapp.message." + state
				event := s.compatibilityEvent(name, c, msg, status["errors"])

				e = delivery.Record(r.Context(), s.Store, p, "status:"+id+":"+state+":"+str(status, "timestamp"), name, event, str(c, "id"), func(tx pgx.Tx) error {
					// Serialize updates for the same message and keep delivery states monotonic.
					_, err := tx.Exec(r.Context(), "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", p+":"+id)
					if err != nil {
						return err
					}

					var b []byte

					err = tx.QueryRow(r.Context(), "SELECT data FROM resources WHERE project_id=$1 AND kind='messages' AND id=$2", p, id).Scan(&b)

					if err != nil && err != pgx.ErrNoRows {
						return err
					}

					if err == nil {
						var existing store.Object

						if json.Unmarshal(b, &existing) != nil {
							return err
						}

						if rank(str(existing, "status")) > rank(state) {
							return nil
						}

						existing["status"] = state
						existing["statuses"] = []any{status}
						existing["updated_at"] = time.Now().UTC().Format(time.RFC3339Nano)
						msg = existing
					}

					b, _ = json.Marshal(msg)
					_, err = tx.Exec(r.Context(), "INSERT INTO resources(project_id,kind,id,data) VALUES($1,'messages',$2,$3) ON CONFLICT(project_id,kind,id) DO UPDATE SET data=EXCLUDED.data", p, id, b)

					return err
				})
				if e != nil {
					return e
				}

				if state == "failed" {
					if stopped, detail := providerHasError(status, 131050); stopped {
						waID := normalizedPhone(str(status, "recipient_id"))
						sourceKey := "marketing-preference:delivery:" + id + ":" + str(status, "timestamp")

						if e = s.recordMarketingPreference(r.Context(), p, c, waID, "", "stopped", detail, "meta_delivery_error", sourceKey, parseProviderTime(str(status, "timestamp"))); e != nil {
							return e
						}
					}
				}
			}
		}
	}

	if e := s.receiveTemplateChanges(r, p, raw); e != nil {
		return e
	}

	return s.receiveCoexistence(r, p, raw)
}

func validDeliveryStatus(s string) bool {
	return s == "sent" || s == "delivered" || s == "read" || s == "played" || s == "failed"
}

func rank(s string) int {
	switch s {
	case "played":
		return 5
	case "sent":
		return 1
	case "failed":
		return 2
	case "delivered":
		return 3
	case "read":
		return 4
	}

	return 0
}

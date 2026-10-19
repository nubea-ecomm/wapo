package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/channel"
	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func (s *Server) sendNative(w http.ResponseWriter, r *http.Request) {
	body, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON object required")
		return
	}

	c, e := s.Store.Get(r.Context(), project(r), "connections", str(body, "connection_id"))
	if e != nil {
		dbError(w, e)
		return
	}

	payload := object(body, "payload")
	if payload == nil {
		fail(w, 422, "validation_error", "payload is required")
		return
	}

	s.send(w, r, c, payload, false)
}

func (s *Server) send(w http.ResponseWriter, r *http.Request, c, payload store.Object, compat bool) {
	p := project(r)

	if c["status"] != "connected" {
		fail(w, 409, "connection_not_ready", "Connection has not completed onboarding")
		return
	}

	typ := str(c, "channel")
	if !s.Config.ChannelEnabled(typ) {
		fail(w, 422, "unsupported_channel", "This channel is not enabled")
		return
	}

	var connector channel.Connector = channel.Webchat{}

	token := ""

	if typ == "whatsapp" {
		meta := s.Meta
		if strings.HasSuffix(r.URL.Path, "/marketing_messages") {
			meta.MessageEndpoint = "marketing_messages"
		}

		connector = meta

		var e error

		token, e = s.Store.Unseal(str(c, "access_token"), p)
		if e != nil {
			fail(w, 500, "credential_error", "Cannot decrypt channel credentials")
			return
		}

		var tokenState connectionTokenState

		token, tokenState, e = s.ensureConnectionToken(r.Context(), p, c, token)
		if e != nil {
			dbError(w, e)
			return
		}

		if tokenState.Expired {
			s.credentialExpired(w, r, c)
			return
		}

		payload["messaging_product"] = "whatsapp"
	}

	if str(payload, "to") == "" || str(payload, "type") == "" {
		fail(w, 422, "validation_error", "payload.to and payload.type are required")
		return
	}

	if typ == "whatsapp" {
		if contact := normalizedPhone(str(payload, "to")); contact != "" {
			payload["to"] = contact
		}
	}

	if typ == "webchat" && str(payload, "type") != "text" {
		fail(w, 422, "unsupported_message", "webchat currently supports text only")
		return
	}

	if str(payload, "type") == "text" && str(object(payload, "text"), "body") == "" {
		fail(w, 422, "validation_error", "text.body is required")
		return
	}

	if str(payload, "type") == "template" {
		template := object(payload, "template")
		if str(template, "name") == "" || str(object(template, "language"), "code") == "" {
			fail(w, 422, "validation_error", "template.name and template.language.code are required")
			return
		}
	}

	if typ == "whatsapp" && str(payload, "type") != "template" {
		open, _, err := s.Store.ServiceWindow(r.Context(), p, str(c, "id"), str(payload, "to"))
		if err != nil {
			dbError(w, err)
			return
		}

		if !open {
			fail(w, 409, "template_required", "A template is required to start a conversation or message outside the 24-hour customer service window")
			return
		}
	}

	b, _ := json.Marshal(payload)
	key := r.Header.Get("Idempotency-Key")

	if key == "" {
		key = store.ID("automatic")
	}

	if len(key) > 200 {
		fail(w, 400, "invalid_idempotency_key", "Idempotency-Key must be at most 200 characters")
		return
	}

	fresh, status, response, e := s.Store.Reserve(r.Context(), p, key, store.Hash(str(c, "id")+":"+r.URL.Path+":"+string(b)))
	if e != nil {
		dbError(w, e)
		return
	}

	if !fresh {
		rawJSON(w, status, response)
		return
	}

	// A separate deadline lets the journal finalize even if the caller disconnects.
	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), 30*time.Second)
	defer cancel()

	result, e := connector.Send(ctx, c, token, payload)
	if e != nil {
		var pe *channel.ProviderError

		if errors.As(e, &pe) {
			if pe.Status >= 400 && pe.Status < 500 && json.Valid(pe.Body) {
				var provider store.Object

				if json.Unmarshal(pe.Body, &provider) == nil && metaCredentialExpired(provider) {
					s.markConnectionCredential(ctx, p, c, "expired", time.Time{})

					response := []byte(`{"error":{"code":"credential_expired","message":"WhatsApp credentials expired. Reconnect the number to continue."}}`)
					if err := s.Store.Complete(ctx, p, key, 409, response); err != nil {
						dbError(w, err)
						return
					}

					rawJSON(w, 409, response)

					return
				}

				if err := s.Store.Complete(ctx, p, key, pe.Status, pe.Body); err != nil {
					dbError(w, err)
					return
				}

				rawJSON(w, pe.Status, pe.Body)

				return
			}
		}

		fail(w, 502, "send_unresolved", "Provider outcome is uncertain. Do not resend blindly; reconcile the request first.")

		return
	}

	now := time.Now().UTC()
	msg := store.Object{"id": result.ProviderID, "connection_id": str(c, "id"), "customer_id": str(c, "customer_id"), "phone_number_id": str(c, "external_id"), "channel": typ, "direction": "outbound", "status": "sent", "to": str(payload, "to"), "timestamp": now.Format(time.RFC3339Nano), "payload": payload, "provider_response": result.Raw}

	if str(payload, "type") == "template" {
		msg["display_text"] = s.renderTemplateMessage(ctx, p, c, msg)
	}

	name := "message.sent"
	eventPayload := store.Object{"event": name, "data": msg}

	if typ == "whatsapp" {
		name = "whatsapp.message.sent"
		eventPayload = s.compatibilityEvent(name, c, msg, nil)
	}

	e = delivery.Record(ctx, s.Store, p, "send:"+result.ProviderID, name, eventPayload, str(c, "id"), func(tx pgx.Tx) error {
		return store.SaveMessage(ctx, tx, p, msg)
	})
	if e != nil {
		fail(w, 503, "send_unresolved", "Provider accepted the message but persistence failed. Reconcile before retrying.")
		return
	}

	status = 201
	out := store.Object{"data": msg}

	if compat {
		status = 200
		out = result.Raw
	}

	response, _ = json.Marshal(out)
	if e = s.Store.Complete(ctx, p, key, status, response); e != nil {
		fail(w, 503, "send_unresolved", "Message was sent but the request journal could not be finalized")
		return
	}

	rawJSON(w, status, response)
}

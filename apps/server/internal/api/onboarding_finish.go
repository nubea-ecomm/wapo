package api

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strings"

	"wapo.local/server/internal/store"
)

func (s *Server) finishOnboarding(ctx context.Context, p string, c store.Object, token, mode string) error {
	post := func(path string, body store.Object) error {
		b, _ := json.Marshal(body)
		status, _, e := s.Meta.Call(ctx, "POST", s.Config.MetaVersion+"/"+path, token, b, "")

		if e != nil || status < 200 || status >= 300 {
			return fmt.Errorf("Meta operation %s failed; inspect provider configuration before retrying", strings.Split(path, "/")[1])
		}

		return nil
	}
	if e := post(str(c, "business_account_id")+"/subscribed_apps", store.Object{"override_callback_uri": s.metaCallbackURL(), "verify_token": s.Config.MetaVerifyToken}); e != nil {
		return e
	}

	if mode == "reconnect" {
		return nil
	}

	if mode == "dedicated" { // Dedicated numbers require registration; never register or migrate a Coexistence number.
		n, e := rand.Int(rand.Reader, big.NewInt(1_000_000))
		if e != nil {
			return e
		}

		c["registration_pin"] = s.Store.Seal(fmt.Sprintf("%06d", n.Int64()), p)
		if e = s.Store.Put(ctx, p, "connections", str(c, "id"), c, false); e != nil {
			return e
		}

		return post(str(c, "external_id")+"/register", store.Object{"messaging_product": "whatsapp", "pin": fmt.Sprintf("%06d", n.Int64())})
	}

	// Each sync is time-sensitive and one-shot. Attempt both, even if the first fails.
	contacts := post(str(c, "external_id")+"/smb_app_data", store.Object{"messaging_product": "whatsapp", "sync_type": "smb_app_state_sync"})
	history := post(str(c, "external_id")+"/smb_app_data", store.Object{"messaging_product": "whatsapp", "sync_type": "history"})
	c["contacts_sync_requested"] = contacts == nil
	c["history_sync_requested"] = history == nil

	// The number is subscribed and can message without the snapshots. Meta
	// refuses them for a number that already synced or onboarded more than 24 h
	// ago, so a refusal is recorded instead of failing the connection.
	if e := errors.Join(contacts, history); e != nil {
		c["sync_error"] = e.Error()
		slog.Warn("coexistence sync not started", "project", p, "connection", str(c, "id"), "contacts", contacts == nil, "history", history == nil)
	} else {
		delete(c, "sync_error")
	}

	return nil
}

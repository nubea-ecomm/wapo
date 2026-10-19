package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func (s *Server) completeSetup(w http.ResponseWriter, r *http.Request) {
	o, e := s.lookupSetup(r)
	if e != nil {
		fail(w, 410, "link_unavailable", "Setup link expired, completed, revoked or unknown")
		return
	}

	if origin := r.Header.Get("Origin"); origin != "" && !s.setupOrigin(o, origin) {
		fail(w, 403, "origin_denied", "This origin cannot complete the setup link")
		return
	}

	if !s.onboardingReady() {
		fail(w, 503, "onboarding_not_configured", "Meta onboarding is not configured")
		return
	}

	input, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON object required")
		return
	}

	mode := str(input, "connection_type")
	allowed := false

	for _, v := range o["allowed_connection_types"].([]any) {
		if v == mode {
			allowed = true
		}
	}

	if !allowed || str(input, "code") == "" || !numeric(str(input, "waba_id")) {
		fail(w, 422, "validation_error", "code, waba_id and an allowed connection_type are required")
		return
	}

	p := r.PathValue("project")
	id := str(o, "id")
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)

	defer cancel()

	current, e := s.claimSetupCompletion(ctx, p, id)
	if e != nil {
		fail(w, 409, "setup_busy", "Another request is completing this setup link")
		return
	}

	claimed := true

	defer func() {
		if claimed {
			s.releaseSetupCompletion(p, id)
		}
	}()
	// OAuth secrets are exchanged server-side and never returned to the browser.
	q := url.Values{"client_id": {s.Config.MetaAppID}, "client_secret": {s.Config.MetaAppSecret}, "code": {str(input, "code")}}
	status, b, e := s.Meta.Call(ctx, "GET", s.Config.MetaVersion+"/oauth/access_token", "", nil, q.Encode())

	if e != nil || status != 200 {
		fail(w, 502, "oauth_exchange_failed", "Meta code exchange failed. Restart signup to obtain a fresh code.")
		return
	}

	var auth store.Object

	if json.Unmarshal(b, &auth) != nil || str(auth, "access_token") == "" {
		fail(w, 502, "oauth_exchange_failed", "Meta did not return a token")
		return
	}

	token := str(auth, "access_token")
	waba := str(input, "waba_id")
	// Discover phone ID server-side. Coexistence completion events may omit it.
	status, b, e = s.Meta.Call(ctx, "GET", s.Config.MetaVersion+"/"+waba+"/phone_numbers", token, nil, "fields=id,display_phone_number,quality_rating,is_on_biz_app&limit=100")
	if e != nil || status != 200 {
		fail(w, 502, "asset_verification_failed", "Cannot read the authorized WABA phone numbers")
		return
	}

	var listing struct {
		Data []store.Object `json:"data"`
	}

	if json.Unmarshal(b, &listing) != nil {
		fail(w, 502, "asset_verification_failed", "Invalid Meta phone list")
		return
	}

	phoneID := str(input, "phone_number_id")

	var selected store.Object

	for _, phone := range listing.Data {
		if (phoneID != "" && str(phone, "id") == phoneID) || (phoneID == "" && len(listing.Data) == 1) {
			selected = phone
			break
		}
	}

	if selected == nil {
		fail(w, 422, "ambiguous_phone_number", "Select a phone number belonging to the authorized WABA")
		return
	}

	phoneID = str(selected, "id")
	isCoex, _ := selected["is_on_biz_app"].(bool)

	if (mode == "coexistence") != isCoex {
		fail(w, 422, "connection_type_mismatch", "Meta phone status does not match the chosen connection type")
		return
	}

	tx, e := s.Store.Pool.Begin(ctx)
	if e != nil {
		dbError(w, e)
		return
	}
	defer tx.Rollback(context.Background())

	var raw []byte

	e = tx.QueryRow(ctx, "SELECT data FROM resources WHERE project_id=$1 AND kind='setup_links' AND id=$2 AND data->>'status'='processing' FOR UPDATE", p, id).Scan(&raw)

	if e != nil || json.Unmarshal(raw, &current) != nil {
		fail(w, 409, "setup_state_changed", "Setup link state changed while authorization was in progress")
		return
	}

	// Reconnect keeps the connection identity and its conversation history.
	var connection store.Object

	reconnectID := str(current, "reconnect_connection_id")

	if reconnectID != "" {
		var existing []byte

		e = tx.QueryRow(ctx, "SELECT data FROM resources WHERE project_id=$1 AND kind='connections' AND id=$2 FOR UPDATE", p, reconnectID).Scan(&existing)
		if e != nil {
			dbError(w, notFound(e))
			return
		}

		if json.Unmarshal(existing, &connection) != nil || str(connection, "customer_id") != str(current, "customer_id") || str(connection, "external_id") != phoneID || str(connection, "business_account_id") != waba {
			fail(w, 422, "reconnect_mismatch", "Authorize the original customer's WhatsApp account and number")
			return
		}
	} else {
		var owner string

		e = tx.QueryRow(ctx, "SELECT id FROM resources WHERE project_id=$1 AND kind='connections' AND data->>'external_id'=$2", p, phoneID).Scan(&owner)

		if e != pgx.ErrNoRows {
			if e != nil {
				dbError(w, e)
			} else {
				fail(w, 409, "number_already_connected", "Use a reconnect link for this number")
			}

			return
		}

		connection = store.Object{"id": store.ID("con"), "channel": "whatsapp", "customer_id": current["customer_id"], "external_id": phoneID, "business_account_id": waba, "created_at": time.Now().UTC().Format(time.RFC3339Nano), "inbound_processing_enabled": true}
	}

	connection["display_phone_number"] = selected["display_phone_number"]
	connection["quality_rating"] = selected["quality_rating"]
	connection["connection_type"] = mode
	connection["access_token"] = s.Store.Seal(token, p)

	if expiresAt := expirationFromSeconds(auth["expires_in"]); !expiresAt.IsZero() {
		connection["access_token_expires_at"] = expiresAt.Format(time.RFC3339Nano)
	}

	connection["credential_status"] = "valid"
	connection["status"] = "onboarding"
	delete(connection, "onboarding_error")
	raw, _ = json.Marshal(connection)
	if reconnectID != "" {
		_, e = tx.Exec(ctx, "UPDATE resources SET data=$3 WHERE project_id=$1 AND kind='connections' AND id=$2", p, reconnectID, raw)
	} else {
		_, e = tx.Exec(ctx, "INSERT INTO resources(project_id,kind,id,data) VALUES($1,'connections',$2,$3)", p, str(connection, "id"), raw)
	}

	if e != nil {
		dbError(w, e)
		return
	}

	current["status"] = "completed"
	delete(current, "completion_started_at")
	current["whatsapp_setup_status"] = "processing"
	current["connection_id"] = connection["id"]
	raw, _ = json.Marshal(current)

	_, e = tx.Exec(ctx, "UPDATE resources SET data=$3 WHERE project_id=$1 AND kind='setup_links' AND id=$2", p, id, raw)
	if e != nil {
		dbError(w, e)
		return
	}

	if e = tx.Commit(ctx); e != nil {
		dbError(w, e)
		return
	}

	claimed = false
	// Credentials survive any provider failure below; the project owner can inspect/recover the binding.
	finishMode := mode
	if reconnectID != "" {
		finishMode = "reconnect"
	}

	e = s.finishOnboarding(ctx, p, connection, token, finishMode)
	if e != nil {
		connection["status"] = "onboarding_failed"
		connection["onboarding_error"] = e.Error()
	} else {
		connection["status"] = "connected"
	}

	saveCtx, saveCancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)

	defer saveCancel()

	for _, field := range []string{"health_status", "health_issues", "health_checked_at"} {
		delete(connection, field)
	}

	if e = s.Store.Put(saveCtx, p, "connections", str(connection, "id"), connection, false); e != nil {
		dbError(w, e)
		return
	}

	if _, e = s.Store.Pool.Exec(saveCtx, "DELETE FROM resources WHERE project_id=$1 AND kind='connection_health' AND id=$2", p, str(connection, "id")); e != nil {
		dbError(w, e)
		return
	}

	current["whatsapp_setup_status"] = connection["status"]
	current["whatsapp_setup_error"] = connection["onboarding_error"]

	if e = s.Store.Put(saveCtx, p, "setup_links", id, current, false); e != nil {
		dbError(w, e)
		return
	}

	if str(connection, "status") != "connected" {
		fail(w, 502, "onboarding_incomplete", "Credentials were saved but Meta registration, subscription or Coexistence sync needs operator recovery. Inspect the connection.")
		return
	}

	event := store.Object{"event": "whatsapp.phone_number.created", "phone_number_id": phoneID, "customer": store.Object{"id": o["customer_id"]}, "data": store.Object{"phone_number_id": phoneID, "customer": store.Object{"id": o["customer_id"]}}}
	if e = delivery.Record(saveCtx, s.Store, p, "connected:"+str(connection, "id"), "whatsapp.phone_number.created", event, str(connection, "id"), nil); e != nil {
		fail(w, 503, "event_pending", "Number connected but lifecycle event could not be queued; inspect the connection")
		return
	}

	redirect := str(o, "success_redirect_url")
	if redirect != "" {
		u, _ := url.Parse(redirect)
		q := u.Query()
		q.Set("phone_number_id", phoneID)
		q.Set("business_account_id", waba)
		q.Set("display_phone_number", str(connection, "display_phone_number"))
		u.RawQuery = q.Encode()
		redirect = u.String()
	}

	write(w, 200, store.Object{"data": store.Object{"connection": clean(connection), "redirect_url": redirect}})
}

package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"wapo.local/server/internal/store"
)

// signupEvent returns the Embedded Signup completion event the hosted page
// received. FINISH is Meta's regular flow; the Business App flow reports
// FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING. Unknown values are dropped.
func signupEvent(input store.Object) string {
	switch event := str(input, "signup_event"); event {
	case "FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING":
		return event
	}

	return ""
}

// failConnectionTypeMismatch reports which phone and WhatsApp account Meta
// returned and how Meta classified it, so a rejected signup can be diagnosed
// from the hosted page and logs instead of guessed. The browser only learns
// details about the phone it just authorized; no credential is exposed.
func (s *Server) failConnectionTypeMismatch(ctx context.Context, w http.ResponseWriter, project, link, token, mode, event, waba string, phone store.Object) {
	onApp, reported := phone["is_on_biz_app"].(bool)
	metaType := "dedicated"

	if onApp {
		metaType = "coexistence"
	}

	details := store.Object{
		"requested_connection_type": mode,
		"meta_connection_type":      metaType,
		"phone_number_id":           str(phone, "id"),
		"display_phone_number":      str(phone, "display_phone_number"),
		"waba_id":                   waba,
		"waba_name":                 s.wabaName(ctx, token, waba),
		"signup_event":              event,
	}

	slog.Warn("setup completion failed", "project", project, "setup_link", link, "code", "connection_type_mismatch",
		"requested_connection_type", mode, "meta_connection_type", metaType, "is_on_biz_app_reported", reported,
		"phone_number_id", details["phone_number_id"], "waba_id", waba, "signup_event", event)

	message := "Meta returned a phone whose status does not match the chosen connection type"
	if mode == "coexistence" && event == "FINISH" {
		message = "Meta completed its regular signup instead of connecting the WhatsApp Business App"
	}

	write(w, 422, store.Object{"error": store.Object{"code": "connection_type_mismatch", "message": message, "details": details}})
}

// wabaName is best effort: a missing name must not hide the mismatch itself.
func (s *Server) wabaName(ctx context.Context, token, waba string) string {
	if waba == "" {
		return ""
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	status, raw, e := s.Meta.Call(ctx, "GET", s.Config.MetaVersion+"/"+waba, token, nil, "fields=name")
	if e != nil || status != 200 {
		return ""
	}

	var account struct {
		Name string `json:"name"`
	}

	if json.Unmarshal(raw, &account) != nil {
		return ""
	}

	return account.Name
}

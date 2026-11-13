package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"wapo.local/server/internal/store"
)

// compatPhoneHealth answers `GET /platform/v1/whatsapp/phone_numbers/{id}/health`
// in the reference platform's schema, derived from the same cached diagnostics
// as the native endpoint. It only runs a check when none is cached.
func (s *Server) compatPhoneHealth(w http.ResponseWriter, r *http.Request, c store.Object) {
	report, e := s.Store.Get(r.Context(), project(r), "connection_health", str(c, "id"))
	if errors.Is(e, store.ErrNotFound) {
		report, e = s.checkConnection(r.Context(), project(r), c)
		if e != nil {
			slog.Warn("compatibility health check failed", "project", project(r), "connection", str(c, "id"), "error_type", errorType(e))
			write(w, 200, store.Object{"status": "error", "timestamp": time.Now().UTC().Format(time.RFC3339Nano), "error": "The health check could not be completed"})

			return
		}
	}

	if e != nil {
		dbError(w, e)
		return
	}

	write(w, 200, compatHealth(report))
}

func compatHealth(report store.Object) store.Object {
	// A fresh report holds typed slices, a cached one decoded JSON: normalize.
	raw, _ := json.Marshal(report)
	report = store.Object{}
	json.Unmarshal(raw, &report)

	byID := map[string][]store.Object{}
	list, _ := report["checks"].([]any)

	for _, item := range list {
		if o, ok := item.(map[string]any); ok {
			byID[str(o, "id")] = append(byID[str(o, "id")], o)
		}
	}

	checks := store.Object{}
	set := func(name string, check store.Object) {
		if check != nil {
			checks[name] = check
		}
	}
	set("phone_number_access", compatCheck(byID["phone_access"], "Meta did not confirm access to this phone number"))
	set("token_validity", compatCheck(byID["access_token"], "The access token is expired, invalid or lacks the WhatsApp permissions"))
	set("webhook_subscription", compatCheck(byID["webhook_subscription"], "The Meta app is not subscribed to this WhatsApp Business Account"))
	set("webhook_verified", compatCheck(byID["webhook_verification"], "Meta has not verified the webhook callback"))
	set("messaging_health", compatMessaging(report, byID["messaging_health"]))

	timestamp := str(report, "checked_at")
	if timestamp == "" {
		timestamp = time.Now().UTC().Format(time.RFC3339Nano)
	}

	out := store.Object{"timestamp": timestamp, "checks": checks}
	messaging, _ := checks["messaging_health"].(store.Object)
	_, phoneKnown := checks["phone_number_access"]

	switch {
	case str(report, "status") == "error":
		out["status"] = "unhealthy"
	case !phoneKnown:
		// Without a confirmed phone lookup there is nothing to call healthy.
		out["status"] = "error"
		out["error"] = "Meta could not be reached to confirm this phone number"
	case str(report, "status") == "warning" || (messaging != nil && messaging["passed"] == false):
		out["status"] = "degraded"
	default:
		out["status"] = "healthy"
	}

	return out
}

// compatCheck folds Wapo checks into one pass/fail. An unconfirmed (`unknown`)
// check is omitted rather than reported as passed or failed.
func compatCheck(list []store.Object, failure string) store.Object {
	worst, rank := store.Object(nil), 0

	for _, check := range list {
		r := map[string]int{"pass": 1, "unknown": 2, "warning": 3, "fail": 4}[str(check, "status")]
		if r > rank {
			worst, rank = check, r
		}
	}

	if worst == nil || rank == 2 {
		return nil
	}

	details := store.Object{"status": worst["status"], "message": worst["message"]}

	for _, key := range []string{"missing_permissions", "provider_error", "verified_at", "scope"} {
		if v, ok := worst[key]; ok {
			details[key] = v
		}
	}

	out := store.Object{"passed": rank == 1, "details": details}
	if rank > 2 {
		out["error"] = failure
	}

	return out
}

func compatMessaging(report store.Object, list []store.Object) store.Object {
	if len(list) == 0 || str(list[0], "status") == "unknown" {
		return nil
	}

	raw := str(report, "can_send_message")
	passed := str(list[0], "status") == "pass"
	details := store.Object{}
	out := store.Object{"passed": passed, "details": details}

	if overall := compatSendState(raw); overall != "" {
		out["overall_status"] = overall
		details["can_send_message"] = raw
	}

	if entities, ok := object(report, "meta_health")["entities"].([]any); ok {
		details["entities"] = entities
	}

	if !passed {
		out["error"] = "Meta reports messaging restrictions for this phone number"
	}

	return out
}

func compatSendState(v string) string {
	switch v {
	case "AVAILABLE", "LIMITED", "BLOCKED":
		return v
	case "UNAVAILABLE":
		return "BLOCKED"
	}

	return ""
}

// nativeHealth hides the compatibility-only entity snapshot from the native
// report, whose schema the console relies on.
func nativeHealth(report store.Object) store.Object {
	out := store.Object{}

	for k, v := range report {
		if k != "meta_health" {
			out[k] = v
		}
	}

	return out
}

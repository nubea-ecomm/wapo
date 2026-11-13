package api

import (
	"strings"
	"testing"

	"wapo.local/server/internal/store"
)

// healthReport builds a report the way checkConnection does, from Meta's
// health_status and the states of the other checks.
func healthReport(overall string, states map[string]string, health store.Object) store.Object {
	checks := []store.Object{}
	add := func(id, label, state, message string, details store.Object) {
		o := store.Object{"id": id, "label": label, "status": state, "message": message}
		for k, v := range details {
			o[k] = v
		}

		checks = append(checks, o)
	}

	for id, state := range states {
		add(id, id, state, "detalle", nil)
	}

	report := store.Object{"status": overall, "checked_at": "2026-11-13T00:00:00Z"}

	if health != nil {
		addHealthChecks(health, add, store.Object{})
		report["can_send_message"] = health["can_send_message"]
		report["meta_health"] = store.Object{"entities": healthEntities(health)}
	}

	report["checks"] = checks

	return report
}

func TestCompatHealthMapsDiagnosticsToThePlatformSchema(t *testing.T) {
	passing := map[string]string{"access_token": "pass", "phone_access": "pass", "account_access": "pass", "webhook_subscription": "pass", "webhook_verification": "unknown"}
	healthy := compatHealth(healthReport("unknown", passing, store.Object{"can_send_message": "AVAILABLE", "entities": []any{store.Object{"entity_type": "PHONE_NUMBER", "id": "123", "can_send_message": "AVAILABLE"}}}))
	checks := object(healthy, "checks")

	if str(healthy, "status") != "healthy" || str(healthy, "timestamp") != "2026-11-13T00:00:00Z" {
		t.Fatalf("an unconfirmed secondary check must not degrade a passing number: %v", healthy)
	}

	if _, ok := checks["webhook_verified"]; ok {
		t.Fatal("an unknown check must be omitted, not reported as passed or failed")
	}

	for _, name := range []string{"phone_number_access", "token_validity", "webhook_subscription", "messaging_health"} {
		if object(checks, name)["passed"] != true {
			t.Fatalf("%s should pass: %v", name, checks)
		}
	}

	if str(object(checks, "messaging_health"), "overall_status") != "AVAILABLE" {
		t.Fatal(checks)
	}

	payment := store.Object{"can_send_message": "BLOCKED", "entities": []any{
		store.Object{"entity_type": "PHONE_NUMBER", "id": "123", "can_send_message": "AVAILABLE"},
		store.Object{"entity_type": "WABA", "id": "456", "can_send_message": "BLOCKED", "additional_info": []any{"Account under review"}, "errors": []any{
			store.Object{"error_code": 141006, "error_description": "Payment method needs attention"},
			store.Object{"error_code": 1, "error_description": "SIP calling is not configured"},
		}},
		store.Object{"entity_type": "APP", "id": "789", "can_send_message": "UNAVAILABLE"},
	}}
	degraded := compatHealth(healthReport("warning", passing, payment))
	messaging := object(object(degraded, "checks"), "messaging_health")

	if str(degraded, "status") != "degraded" || messaging["passed"] != false || str(messaging, "overall_status") != "BLOCKED" || str(messaging, "error") == "" {
		t.Fatalf("payment restriction: %v", degraded)
	}

	entities, _ := object(messaging, "details")["entities"].([]any)
	if len(entities) != 3 {
		t.Fatalf("entities: %v", entities)
	}

	waba := entities[1].(map[string]any)
	info, _ := waba["additional_info"].([]any)

	if str(waba, "entity_type") != "WABA" || str(waba, "can_send_message") != "BLOCKED" || len(info) != 2 || info[1] != "Payment method needs attention" {
		t.Fatalf("WABA entity must explain the restriction without calling errors: %v", waba)
	}

	if str(entities[2].(map[string]any), "can_send_message") != "BLOCKED" {
		t.Fatal("UNAVAILABLE must map to the schema's BLOCKED")
	}

	broken := compatHealth(healthReport("error", map[string]string{"access_token": "fail", "phone_access": "fail"}, nil))
	if str(broken, "status") != "unhealthy" || object(object(broken, "checks"), "token_validity")["passed"] != false || str(object(object(broken, "checks"), "token_validity"), "error") == "" {
		t.Fatalf("failed credentials: %v", broken)
	}

	unreachable := compatHealth(healthReport("unknown", map[string]string{"access_token": "unknown", "phone_access": "unknown"}, nil))
	if str(unreachable, "status") != "error" || !strings.Contains(str(unreachable, "error"), "Meta") || len(object(unreachable, "checks")) != 0 {
		t.Fatalf("an unreachable provider is an error, not health: %v", unreachable)
	}
}

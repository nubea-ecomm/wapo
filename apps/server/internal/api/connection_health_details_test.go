package api

import (
	"strings"
	"testing"

	"wapo.local/server/internal/store"
)

func TestMessagingHealthSeverity(t *testing.T) {
	payment := store.Object{"error_code": 141006, "error_description": "There is an error with the payment method"}
	verification := store.Object{"error_code": 1, "error_description": "The Business has not passed business verification"}
	sip := store.Object{"error_code": 2, "error_description": "WhatsApp Business calling cannot use SIP because it is not enabled"}
	server := store.Object{"error_code": 3, "error_description": "This app cannot use SIP for WhatsApp Business calling because it has not configured a SIP server"}
	blocked := store.Object{"error_code": 4, "error_description": "Messaging disabled for policy violation"}

	for _, tc := range []struct {
		name, state, want string
		errors            []any
		count             int
		billing           bool
	}{
		{"available", "AVAILABLE", "pass", nil, 1, false},
		{"limited", "LIMITED", "warning", nil, 1, false},
		{"missing", "", "unknown", nil, 1, false},
		{"unexplained block", "BLOCKED", "fail", nil, 1, false},
		{"unavailable", "UNAVAILABLE", "fail", []any{sip}, 1, false},
		{"calling only", "BLOCKED", "unknown", []any{sip, server}, 1, false},
		{"calling does not break available messaging", "AVAILABLE", "pass", []any{sip}, 1, false},
		{"payment restriction", "BLOCKED", "warning", []any{payment}, 2, true},
		{"verification restriction", "BLOCKED", "warning", []any{verification}, 2, false},
		{"screenshot", "BLOCKED", "warning", []any{sip, payment, verification, server}, 3, true},
		{"messaging block", "BLOCKED", "fail", []any{sip, payment, blocked}, 3, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			health := store.Object{"can_send_message": tc.state, "entities": []any{store.Object{"entity_type": "WABA", "errors": tc.errors}}}
			billing := store.Object{"status": "unknown", "manage_url": "https://business.facebook.com/wa/manage/accounts/"}
			checks := []store.Object{}

			addHealthChecks(health, func(id, label, state, message string, details store.Object) {
				check := store.Object{"id": id, "label": label, "status": state, "message": message}
				for k, v := range details {
					check[k] = v
				}

				checks = append(checks, check)
			}, billing)

			if len(checks) != tc.count || str(checks[0], "status") != tc.want {
				t.Fatalf("unexpected checks: %v", checks)
			}

			if (str(billing, "status") == "attention_required") != tc.billing {
				t.Fatalf("unexpected billing signal: %v", billing)
			}

			for _, check := range checks {
				if strings.Contains(strings.ToLower(str(check, "message")), "sip") {
					t.Fatal("calling diagnostics leaked into messaging checks")
				}

				if str(check, "status") == "warning" && str(check, "id") != "messaging_health" {
					if str(check, "possible_solution") == "" || object(check, "provider_error") == nil {
						t.Fatal("warning must retain provider evidence and actionable guidance")
					}
				}
			}
		})
	}
}

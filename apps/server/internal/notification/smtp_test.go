package notification

import (
	"strings"
	"testing"
)

func TestBuildMIMEContainsBothBodiesAndRejectsHeaderInjection(t *testing.T) {
	raw := string(buildMIME(SMTPConfig{FromAddress: "alerts@example.com", FromName: "Wapo\r\nBcc: attacker@example.com"}, Message{
		To: []string{"owner@example.com"}, Subject: "Resumen semanal\r\nBcc: attacker@example.com", Text: "plain metrics", HTML: "<strong>html metrics</strong>",
	}))

	for _, expected := range []string{"alerts@example.com", "To: owner@example.com", "plain metrics", "<strong>html metrics</strong>"} {
		if !strings.Contains(raw, expected) {
			t.Fatalf("missing %q in MIME message", expected)
		}
	}

	if strings.Contains(raw, "\r\nBcc:") {
		t.Fatal("header injection was retained")
	}
}

func TestBuildMIMEHidesMultipleRecipientAddresses(t *testing.T) {
	raw := string(buildMIME(SMTPConfig{FromAddress: "alerts@example.com", FromName: "Wapo"}, Message{
		To: []string{"first@example.com", "second@example.com"}, Subject: "Alert", Text: "text", HTML: "html",
	}))

	if !strings.Contains(raw, "To: undisclosed-recipients:;") || strings.Contains(raw, "first@example.com") || strings.Contains(raw, "second@example.com") {
		t.Fatalf("multiple recipient addresses leaked in message headers: %s", raw)
	}
}

package api

import (
	"net/http/httptest"
	"strings"
	"testing"
	"wapo.local/server/internal/config"
)

func TestDocumentationRendersGuidesWithoutSecrets(t *testing.T) {
	server := &Server{Config: config.Config{WebOrigin: "https://console.example.com", AdminKey: "secret-admin-key", MetaAppSecret: "secret-meta-key"}}
	w := httptest.NewRecorder()
	server.docsPage(w, httptest.NewRequest("GET", "/docs", nil))
	if w.Code != 200 {
		t.Fatal(w.Code)
	}
	body := w.Body.String()
	for _, text := range []string{`id="docs-search"`, "Your first request", "Send a WhatsApp message", "Receive signed webhooks", "https://console.example.com", "/docs/assets/docs.js"} {
		if !strings.Contains(body, text) {
			t.Fatalf("documentation missing %q", text)
		}
	}
	for _, text := range []string{"secret-admin-key", "secret-meta-key", "cdn.jsdelivr.net"} {
		if strings.Contains(body, text) {
			t.Fatalf("unexpected documentation content %q", text)
		}
	}
}

package channel

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"wapo.local/server/internal/store"
)

func TestWhatsAppSendPreservesProviderShapeAndUsesBoundCredential(t *testing.T) {
	var calls int

	h := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++

		if r.URL.Path != "/v24.0/123/messages" || r.Header.Get("Authorization") != "Bearer provider-token" {
			t.Error("incorrect provider boundary")
		}

		b, _ := io.ReadAll(r.Body)

		var payload store.Object

		json.Unmarshal(b, &payload)

		if payload["to"] != "549111" {
			t.Error("recipient changed")
		}

		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"messaging_product":"whatsapp","messages":[{"id":"wamid.1"}]}`)
	}))

	defer h.Close()

	w := WhatsApp{BaseURL: h.URL, Version: "v24.0"}
	result, e := w.Send(context.Background(), store.Object{"external_id": "123"}, "provider-token", store.Object{"to": "549111", "type": "text", "text": store.Object{"body": "Hello"}})

	if e != nil || result.ProviderID != "wamid.1" || calls != 1 {
		t.Fatalf("send failed: %#v %v", result, e)
	}
}

func TestWhatsAppProviderErrorsAreNotRetried(t *testing.T) {
	var calls int

	h := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++

		w.WriteHeader(400)
		io.WriteString(w, `{"error":{"code":131047,"message":"Outside session"}}`)
	}))

	defer h.Close()

	w := WhatsApp{BaseURL: h.URL, Version: "v24.0"}
	_, e := w.Send(context.Background(), store.Object{"external_id": "123"}, "token", store.Object{"to": "1"})

	var provider *ProviderError

	if !errors.As(e, &provider) || provider.Status != 400 || calls != 1 {
		t.Fatalf("provider error lost or retried: %v", e)
	}
}

package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"wapo.local/server/internal/config"
	"wapo.local/server/internal/store"
)

func TestConnectionTypeMismatchNamesWhatMetaReturned(t *testing.T) {
	nameStatus := 200

	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v24.0/654321" || r.URL.Query().Get("fields") != "name" || r.Header.Get("Authorization") != "Bearer signup-token" {
			t.Errorf("unexpected Meta call %s?%s", r.URL.Path, r.URL.RawQuery)
		}

		write(w, nameStatus, store.Object{"id": "654321", "name": "Marbest - Nubea"})
	}))

	defer meta.Close()

	s := New(nil, config.Config{MetaAppID: "app", MetaAppSecret: "secret", MetaVersion: "v24.0"})
	s.Meta.BaseURL = meta.URL

	cases := []struct {
		name, mode, event, wabaName, metaType, message string
		phone                                          store.Object
	}{
		{
			name: "regular signup for a Business App link", mode: "coexistence", event: "FINISH", wabaName: "Marbest - Nubea", metaType: "dedicated",
			message: "Meta completed its regular signup instead of connecting the WhatsApp Business App",
			// Meta omitting is_on_biz_app is reported as a dedicated number.
			phone: store.Object{"id": "111", "display_phone_number": "+57 322 0000000"},
		},
		{
			name: "Business App number on a dedicated link", mode: "dedicated", event: "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", wabaName: "Marbest - Nubea", metaType: "coexistence",
			message: "Meta returned a phone whose status does not match the chosen connection type",
			phone:   store.Object{"id": "111", "display_phone_number": "+57 322 0000000", "is_on_biz_app": true},
		},
	}

	for _, c := range cases {
		recorder := httptest.NewRecorder()
		s.failConnectionTypeMismatch(context.Background(), recorder, "project", "link", "signup-token", c.mode, c.event, "654321", c.phone)

		var body struct {
			Error struct {
				Code    string       `json:"code"`
				Message string       `json:"message"`
				Details store.Object `json:"details"`
			} `json:"error"`
		}

		if recorder.Code != 422 || json.Unmarshal(recorder.Body.Bytes(), &body) != nil || body.Error.Code != "connection_type_mismatch" {
			t.Fatalf("%s: status=%d body=%s", c.name, recorder.Code, recorder.Body)
		}

		want := store.Object{
			"requested_connection_type": c.mode, "meta_connection_type": c.metaType, "phone_number_id": "111",
			"display_phone_number": "+57 322 0000000", "waba_id": "654321", "waba_name": c.wabaName, "signup_event": c.event,
		}

		for key, value := range want {
			if body.Error.Details[key] != value {
				t.Errorf("%s: details[%s] = %v, want %v", c.name, key, body.Error.Details[key], value)
			}
		}

		if body.Error.Message != c.message {
			t.Errorf("%s: message = %q", c.name, body.Error.Message)
		}
	}

	// The account name is best effort and never hides the mismatch.
	nameStatus = 500
	recorder := httptest.NewRecorder()
	s.failConnectionTypeMismatch(context.Background(), recorder, "project", "link", "signup-token", "coexistence", "", "654321", store.Object{"id": "111"})

	if recorder.Code != 422 {
		t.Fatalf("status=%d", recorder.Code)
	}
}

func TestSignupEventAcceptsOnlyMetaCompletionEvents(t *testing.T) {
	for event, want := range map[string]string{
		"FINISH": "FINISH", "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING": "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING", "<script>": "", "": "",
	} {
		if got := signupEvent(store.Object{"signup_event": event}); got != want {
			t.Errorf("signupEvent(%q) = %q, want %q", event, got, want)
		}
	}
}

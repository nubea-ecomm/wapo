package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"wapo.local/server/internal/store"
)

func TestPublicResourcesNeverExposeSecrets(t *testing.T) {
	source := store.Object{"id": "c", "access_token": "secret", "secret_key": "secret", "registration_pin": "secret", "token_hash": "hash", "onboarding_token": "secret"}
	out := clean(source)

	if len(out) != 1 || out["id"] != "c" {
		t.Fatalf("secret leaked: %#v", out)
	}

	if source["access_token"] != "secret" {
		t.Fatal("mutated source")
	}
}

func TestWebhookEventAllowlistAndPhoneIDs(t *testing.T) {
	for _, event := range []string{"whatsapp.message.received", "whatsapp.phone_number.created", "whatsapp.history.received", "whatsapp.contact.marketing_preference_changed", "message.sent", "*"} {
		if !validEvent(event) {
			t.Errorf("valid event rejected: %s", event)
		}
	}

	for _, event := range []string{"message_template_status_update", "arbitrary", ""} {
		if validEvent(event) {
			t.Errorf("unsupported event accepted: %s", event)
		}
	}

	if !numeric("123456") || numeric("../123") || numeric("v24.0") || numeric("") {
		t.Fatal("invalid phone ID validation")
	}
}

func TestStatusOrderingPreservesReadAndDelivered(t *testing.T) {
	if rank("read") <= rank("delivered") || rank("delivered") <= rank("failed") || rank("failed") <= rank("sent") {
		t.Fatal("status ordering can regress")
	}

	if validDeliveryStatus("queued") || !validDeliveryStatus("read") {
		t.Fatal("unsupported provider status")
	}
}

func TestDecoderRejectsNullTrailingAndNonObjects(t *testing.T) {
	for _, raw := range []string{"null", "[]", "{} {}", "{broken"} {
		r := testRequest(raw)
		if _, e := decode(r); e == nil {
			t.Errorf("accepted invalid object %s", raw)
		}
	}

	if o, e := decode(testRequest(`{"name":"A"}`)); e != nil || str(o, "name") != "A" {
		t.Fatal("valid request rejected")
	}
}

func testRequest(raw string) *http.Request {
	return httptest.NewRequest("POST", "/", strings.NewReader(raw))
}

func TestCustomerFieldsMatchThePublicSchema(t *testing.T) {
	for _, input := range []store.Object{{"metadata": []any{}}, {"email": true}, {"external_customer_id": 42}} {
		if validateCustomer(input) == nil {
			t.Fatalf("accepted invalid customer input: %#v", input)
		}
	}

	if validateCustomer(store.Object{"metadata": map[string]any{"plan": "pro"}, "external_customer_id": "store:account:1"}) != nil {
		t.Fatal("valid metadata rejected")
	}
}

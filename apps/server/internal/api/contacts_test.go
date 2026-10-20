package api

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func TestContactsConsentSuppressionAndErasure(t *testing.T) {
	server, httpServer, project, key := fixture(t)
	server.Meta.Version = "v24.0"
	ctx := context.Background()
	connectionID := store.ID("contact-connection")
	phoneID := "99123456"
	connection := store.Object{"id": connectionID, "name": "Sales", "channel": "whatsapp", "external_id": phoneID, "business_account_id": "998877", "access_token": server.Store.Seal("contact-token", project), "status": "connected"}

	if err := server.Store.Put(ctx, project, "connections", connectionID, connection, true); err != nil {
		t.Fatal(err)
	}

	status, body := request(t, httpServer.URL, key, "POST", "/v1/contacts", store.Object{"connection_id": connectionID, "phone_number": "+1 (555) 123-4567", "display_name": "Ana", "email": "ANA@example.com", "properties": store.Object{"plan": "gold", "score": 5}}, "")
	expect(t, status, 201, body)
	contact := object(body, "data")
	contactID := str(contact, "id")

	if str(contact, "phone_number") != "15551234567" || str(contact, "email") != "ana@example.com" {
		t.Fatalf("contact was not normalized: %#v", contact)
	}

	status, body = request(t, httpServer.URL, key, "PATCH", "/v1/contacts/"+contactID, store.Object{"display_name": "Ana Local", "properties": store.Object{"plan": "enterprise"}}, "")
	expect(t, status, 200, body)

	if str(object(body, "data"), "display_name") != "Ana Local" || str(object(object(body, "data"), "properties"), "plan") != "enterprise" {
		t.Fatalf("contact update failed: %#v", body)
	}

	status, body = request(t, httpServer.URL, key, "GET", "/v1/contacts?search=Ana%20Local&marketing_status=resumed", nil, "")
	expect(t, status, 200, body)

	if len(body["data"].([]any)) != 1 {
		t.Fatalf("contact search failed: %#v", body)
	}

	postMeta := func(raw []byte) {
		req, _ := http.NewRequest(http.MethodPost, httpServer.URL+"/hooks/meta/"+project, bytes.NewReader(raw))
		req.Header.Set("X-Hub-Signature-256", "sha256="+delivery.Signature(raw, "meta-test-secret"))

		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()

		if res.StatusCode != http.StatusOK {
			t.Fatalf("Meta webhook returned %d", res.StatusCode)
		}
	}

	stoppedAt := time.Now().UTC().Add(-5 * time.Minute)
	postMeta([]byte(`{"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"` + phoneID + `"},"user_preferences":[{"wa_id":"15551234567","category":"marketing_messages","value":"stop","detail":"User requested to stop marketing messages","timestamp":"` + stoppedAt.Format(time.RFC3339Nano) + `"}]}}]}]}`))

	status, body = request(t, httpServer.URL, key, "GET", "/v1/contacts/"+contactID, nil, "")
	expect(t, status, 200, body)
	preference := object(object(body, "data"), "marketing_preference")
	if str(preference, "status") != "stopped" || preference["marketing_allowed"] != false {
		t.Fatalf("marketing stop was not recorded: %#v", preference)
	}

	_, err := server.Store.Pool.Exec(ctx, `INSERT INTO template_states(project_id,business_account_id,template_id,data) VALUES($1,'998877','marketing-template','{"id":"marketing-template","name":"promo","language":"es","category":"MARKETING","status":"APPROVED"}')`, project)
	if err != nil {
		t.Fatal(err)
	}

	status, body = request(t, httpServer.URL, key, "POST", "/v1/messages", store.Object{"connection_id": connectionID, "payload": store.Object{"to": "15551234567", "type": "template", "template": store.Object{"name": "promo", "language": store.Object{"code": "es"}}}}, "marketing-blocked")
	expect(t, status, 422, body)

	if str(object(body, "error"), "code") != "marketing_preference_stopped" {
		t.Fatalf("unexpected suppression error: %#v", body)
	}

	postMeta([]byte(`{"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"` + phoneID + `"},"user_preferences":[{"wa_id":"15551234567","category":"marketing_messages","value":"resume","timestamp":"` + stoppedAt.Add(2*time.Minute).Format(time.RFC3339Nano) + `"}]}}]}]}`))

	status, body = request(t, httpServer.URL, key, "GET", "/v1/contacts/"+contactID, nil, "")
	expect(t, status, 200, body)

	if object(object(body, "data"), "marketing_preference")["marketing_allowed"] != true {
		t.Fatalf("marketing resume was not recorded: %#v", body)
	}

	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		write(w, 400, store.Object{"error": store.Object{"code": 131050, "message": "User stopped marketing messages"}})
	}))

	defer meta.Close()

	server.Meta.BaseURL = meta.URL
	status, body = request(t, httpServer.URL, key, "POST", "/v1/messages", store.Object{"connection_id": connectionID, "payload": store.Object{"to": "15551234567", "type": "template", "template": store.Object{"name": "promo", "language": store.Object{"code": "es"}}}}, "marketing-provider-stop")
	expect(t, status, 422, body)
	status, body = request(t, httpServer.URL, key, "GET", "/v1/contacts/"+contactID, nil, "")
	expect(t, status, 200, body)

	if str(object(object(body, "data"), "marketing_preference"), "source") != "meta_synchronous_error" {
		t.Fatalf("synchronous error did not stop marketing: %#v", body)
	}

	postMeta([]byte(`{"entry":[{"changes":[{"value":{"metadata":{"phone_number_id":"` + phoneID + `"},"statuses":[{"id":"failed-marketing-message","status":"failed","recipient_id":"15551234567","timestamp":"` + fmt.Sprint(time.Now().UTC().Add(time.Second).Unix()) + `","errors":[{"code":131050,"message":"User stopped marketing messages"}]}]}}]}]}`))

	status, body = request(t, httpServer.URL, key, "GET", "/v1/contacts/"+contactID, nil, "")
	expect(t, status, 200, body)
	preference = object(object(body, "data"), "marketing_preference")
	if str(preference, "source") != "meta_delivery_error" || preference["marketing_allowed"] != false {
		t.Fatalf("delivery error did not stop marketing: %#v", preference)
	}

	var preferenceEvents int

	if err = server.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM events WHERE project_id=$1 AND name='whatsapp.contact.marketing_preference_changed'", project).Scan(&preferenceEvents); err != nil || preferenceEvents != 3 {
		t.Fatalf("unexpected preference event count: %d %v", preferenceEvents, err)
	}

	tx, err := server.Store.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}

	message := store.Object{"id": "contact-message", "connection_id": connectionID, "channel": "whatsapp", "direction": "inbound", "status": "received", "from": "15551234567", "contact_name": "Provider Ana", "payload": store.Object{"type": "image", "from_user_id": "US.123", "from_parent_user_id": "US.ENT.456", "username": "@ana", "image": store.Object{"id": "contact-media"}}}
	if err = store.SaveMessage(ctx, tx, project, message); err != nil {
		t.Fatal(err)
	}

	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	if err = server.Store.Put(ctx, project, "calls", "contact-call", store.Object{"id": "contact-call", "connection_id": connectionID, "wa_id": "15551234567"}, true); err != nil {
		t.Fatal(err)
	}

	status, body = request(t, httpServer.URL, key, "GET", "/v1/contacts/"+contactID, nil, "")
	expect(t, status, 200, body)

	if str(object(body, "data"), "business_scoped_user_id") != "US.123" || str(object(body, "data"), "username") != "@ana" || str(object(body, "data"), "display_name") != "Ana Local" {
		t.Fatalf("provider identity sync overwrote local contact data: %#v", body)
	}

	status, body = request(t, httpServer.URL, key, "GET", "/v1/conversations/"+contactID, nil, "")
	expect(t, status, 200, body)

	if str(object(body, "data"), "contact_name") != "Ana Local" || str(object(body, "data"), "contact_profile_name") != "Provider Ana" {
		t.Fatalf("conversation did not resolve the current contact name: %#v", body)
	}

	status, body = request(t, httpServer.URL, key, "DELETE", "/v1/contacts/"+contactID, nil, "")
	expect(t, status, 204, body)
	status, body = request(t, httpServer.URL, key, "GET", "/v1/contacts/"+contactID, nil, "")
	expect(t, status, 404, body)

	var messages int

	if err = server.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM resources WHERE project_id=$1 AND kind='messages' AND data->>'connection_id'=$2 AND (data->>'from'='15551234567' OR data->>'to'='15551234567')", project, connectionID).Scan(&messages); err != nil || messages != 0 {
		t.Fatalf("contact messages survived erasure: count=%d error=%v", messages, err)
	}

	var related int

	if err = server.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM resources WHERE project_id=$1 AND id IN ('media:contact-media','contact-call')", project).Scan(&related); err != nil || related != 0 {
		t.Fatalf("contact media or calls survived erasure: count=%d error=%v", related, err)
	}

	_, otherHTTP, _, otherKey := fixture(t)
	status, body = request(t, otherHTTP.URL, otherKey, "GET", "/v1/contacts/"+contactID, nil, "")
	expect(t, status, 404, body)
}

func TestContactDisplayNameFollowsMetaUntilCustomized(t *testing.T) {
	server, httpServer, project, key := fixture(t)
	ctx := context.Background()
	connectionID := store.ID("name-connection")

	if err := server.Store.Put(ctx, project, "connections", connectionID, store.Object{"id": connectionID, "name": "Support", "channel": "whatsapp", "external_id": "445566", "business_account_id": "445577", "access_token": server.Store.Seal("token", project), "status": "connected"}, true); err != nil {
		t.Fatal(err)
	}

	save := func(id, providerName string) {
		tx, err := server.Store.Pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}

		message := store.Object{"id": id, "connection_id": connectionID, "channel": "whatsapp", "direction": "inbound", "status": "received", "from": "15550000000", "contact_name": providerName, "payload": store.Object{"type": "text", "username": "@metauser", "text": store.Object{"body": "hello"}}}
		if err = store.SaveMessage(ctx, tx, project, message); err != nil {
			t.Fatal(err)
		}

		if err = tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}

	contactID := store.ConversationID(connectionID, "15550000000")

	save("name-message-1", "Meta One")

	status, body := request(t, httpServer.URL, key, "GET", "/v1/contacts/"+contactID, nil, "")
	expect(t, status, 200, body)

	if str(object(body, "data"), "display_name") != "Meta One" || str(object(body, "data"), "display_name_source") != "meta" {
		t.Fatalf("initial Meta name was not used: %#v", body)
	}

	save("name-message-2", "Meta Two")

	status, body = request(t, httpServer.URL, key, "GET", "/v1/contacts/"+contactID, nil, "")
	expect(t, status, 200, body)

	if str(object(body, "data"), "display_name") != "Meta Two" {
		t.Fatalf("updated Meta name was not followed: %#v", body)
	}

	status, body = request(t, httpServer.URL, key, "PATCH", "/v1/contacts/"+contactID, store.Object{"display_name": "Nombre local"}, "")
	expect(t, status, 200, body)
	save("name-message-3", "Meta Three")

	status, body = request(t, httpServer.URL, key, "GET", "/v1/conversations/"+contactID, nil, "")
	expect(t, status, 200, body)

	if str(object(body, "data"), "contact_name") != "Nombre local" || str(object(body, "data"), "contact_profile_name") != "Meta Three" {
		t.Fatalf("Meta overwrote a customized display name: %#v", body)
	}

	status, body = request(t, httpServer.URL, key, "PATCH", "/v1/contacts/"+contactID, store.Object{"use_provider_name": true}, "")
	expect(t, status, 200, body)

	if str(object(body, "data"), "display_name") != "Meta Three" || str(object(body, "data"), "display_name_source") != "meta" {
		t.Fatalf("provider name was not restored: %#v", body)
	}

	save("name-message-4", "Meta Four")

	status, body = request(t, httpServer.URL, key, "GET", "/v1/conversations/"+contactID, nil, "")
	expect(t, status, 200, body)

	if str(object(body, "data"), "contact_name") != "Meta Four" {
		t.Fatalf("restored provider name did not keep following Meta: %#v", body)
	}
}

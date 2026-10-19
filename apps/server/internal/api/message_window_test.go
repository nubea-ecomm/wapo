package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func TestWhatsAppRequiresTemplateUntilInboundOpensServiceWindow(t *testing.T) {
	server, h, project, key := fixture(t)
	ctx := context.Background()
	connection := store.ID("con")
	customer := store.ID("cus")
	phoneID := "771001"
	contact := "5491112222333"
	if err := server.Store.Put(ctx, project, "customers", customer, store.Object{"id": customer, "name": "Merchant"}, true); err != nil {
		t.Fatal(err)
	}
	if err := server.Store.Put(ctx, project, "connections", connection, store.Object{"id": connection, "customer_id": customer, "channel": "whatsapp", "external_id": phoneID, "business_account_id": "771000", "access_token": server.Store.Seal("provider-token", project), "status": "connected"}, true); err != nil {
		t.Fatal(err)
	}
	if _, err := server.Store.Pool.Exec(ctx, `INSERT INTO template_states(project_id,business_account_id,template_id,data) VALUES($1,'771000','tpl-welcome','{"id":"tpl-welcome","name":"welcome","language":"es","status":"APPROVED","components":[{"type":"BODY","text":"Hola {{1}}, bienvenido"}]}'::jsonb)`, project); err != nil {
		t.Fatal(err)
	}
	providerCalls := 0
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		providerCalls++
		write(w, 200, store.Object{"messages": []any{store.Object{"id": store.ID("wamid")}}})
	}))
	defer meta.Close()
	server.Meta.BaseURL = meta.URL
	server.Meta.Version = "v24.0"
	text := store.Object{"connection_id": connection, "payload": store.Object{"to": "+54 9 11 1222-2333", "type": "text", "text": store.Object{"body": "Hola"}}}
	status, body := request(t, h.URL, key, "POST", "/v1/messages", text, "outside-window")
	expect(t, status, 409, body)
	if str(object(body, "error"), "code") != "template_required" || providerCalls != 0 {
		t.Fatalf("free-form message escaped the service-window guard: %#v calls=%d", body, providerCalls)
	}
	template := store.Object{"connection_id": connection, "payload": store.Object{"to": contact, "type": "template", "template": store.Object{"name": "welcome", "language": store.Object{"code": "es"}, "components": []any{store.Object{"type": "body", "parameters": []any{store.Object{"type": "text", "text": "Ana"}}}}}}}
	status, body = request(t, h.URL, key, "POST", "/v1/messages", template, "template-start")
	expect(t, status, 201, body)
	if str(object(body, "data"), "display_text") != "Hola Ana, bienvenido" {
		t.Fatalf("template was not rendered in the stored message: %#v", body)
	}
	status, body = request(t, h.URL, key, "GET", "/v1/conversations?customer_id="+customer, nil, "")
	expect(t, status, 200, body)
	listed := body["data"].([]any)[0].(map[string]any)
	if str(object(listed, "last_message"), "display_text") != "Hola Ana, bienvenido" {
		t.Fatalf("inbox preview did not render template text: %#v", listed)
	}
	if providerCalls != 1 {
		t.Fatalf("approved template was not sent: calls=%d", providerCalls)
	}
	tx, err := server.Store.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	inbound := store.Object{"id": store.ID("wamid"), "connection_id": connection, "channel": "whatsapp", "direction": "inbound", "status": "received", "from": contact, "timestamp": time.Now().UTC().Format(time.RFC3339Nano), "payload": store.Object{"type": "text", "text": store.Object{"body": "Respuesta"}}}
	if err = store.SaveMessage(ctx, tx, project, inbound); err != nil {
		t.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}
	status, body = request(t, h.URL, key, "POST", "/v1/messages", text, "inside-window")
	expect(t, status, 201, body)
	if providerCalls != 2 {
		t.Fatalf("open service window rejected free-form reply: calls=%d", providerCalls)
	}
	conversation, err := server.Store.Get(ctx, project, "conversations", store.ConversationID(connection, contact))
	if err != nil || str(conversation, "service_window_expires_at") == "" {
		t.Fatalf("service-window state was not persisted: %#v %v", conversation, err)
	}
	if str(conversation, "customer_id") != customer {
		t.Fatalf("conversation customer was not persisted: %#v", conversation)
	}
	status, body = request(t, h.URL, key, "GET", "/v1/conversations?customer_id="+customer, nil, "")
	expect(t, status, 200, body)
	if len(body["data"].([]any)) != 1 {
		t.Fatalf("customer inbox filter did not return its conversation: %#v", body)
	}
}

package api

import (
	"context"
	"testing"
	"wapo.local/server/internal/store"
)

func TestDeleteTenantRemovesDataRevokesKeysAndDoesNotBootstrapAgain(t *testing.T) {
	server, h, project, key := fixture(t)
	ctx := context.Background()
	admin := store.ID("operator")
	server.Config.AdminKey = admin
	status, o := request(t, h.URL, key, "POST", "/v1/customers", store.Object{"name": "Merchant"}, "")
	expect(t, status, 201, o)
	status, o = request(t, h.URL, key, "POST", "/v1/connections", store.Object{"name": "Chat", "channel": "webchat"}, "")
	expect(t, status, 201, o)
	connection := str(object(o, "data"), "id")
	status, o = request(t, h.URL, key, "POST", "/v1/messages", store.Object{"connection_id": connection, "payload": store.Object{"to": "visitor", "type": "text", "text": store.Object{"body": "Hello"}}}, "delete-test")
	expect(t, status, 201, o)
	status, o = request(t, h.URL, key, "DELETE", "/admin/v1/tenants/"+project, nil, "")
	expect(t, status, 401, o)
	status, o = request(t, h.URL, admin, "DELETE", "/admin/v1/tenants/"+project, nil, "")
	expect(t, status, 204, o)
	for _, table := range []string{"resources", "requests", "events", "deliveries", "api_keys", "whatsapp_accounts"} {
		var count int
		if e := server.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM "+table+" WHERE project_id=$1", project).Scan(&count); e != nil {
			t.Fatal(e)
		}
		if count != 0 {
			t.Fatalf("%s retains %d rows", table, count)
		}
	}
	status, o = request(t, h.URL, key, "GET", "/v1/me", nil, "")
	expect(t, status, 401, o)
	if e := server.Store.Bootstrap(ctx, project, key); e != nil {
		t.Fatal(e)
	}
	status, o = request(t, h.URL, key, "GET", "/v1/me", nil, "")
	expect(t, status, 401, o)
	status, o = request(t, h.URL, admin, "DELETE", "/admin/v1/tenants/"+project, nil, "")
	expect(t, status, 404, o)
}

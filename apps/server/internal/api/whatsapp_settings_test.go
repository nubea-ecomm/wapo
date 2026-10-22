package api

import (
	"encoding/json"
	"strings"
	"testing"

	"wapo.local/server/internal/store"
)

func TestWhatsAppOnlyDeploymentAndCredentialPresence(t *testing.T) {
	server, h, _, key := fixture(t)
	status, o := request(t, h.URL, key, "POST", "/v1/connections", store.Object{"name": "Legacy internal connector", "channel": "webchat"}, "")
	expect(t, status, 201, o)
	connection := str(object(o, "data"), "id")
	server.Config.Channels = nil
	status, o = request(t, h.URL, key, "GET", "/v1/channels", nil, "")
	expect(t, status, 200, o)
	channels := o["data"].([]any)
	if len(channels) != 1 || channels[0].(map[string]any)["id"] != "whatsapp" {
		t.Fatal("unexpected channel catalog", o)
	}

	status, o = request(t, h.URL, key, "POST", "/v1/connections", store.Object{"name": "Blocked", "channel": "webchat"}, "")
	expect(t, status, 422, o)
	status, o = request(t, h.URL, key, "GET", "/v1/connections", nil, "")
	expect(t, status, 200, o)

	if len(o["data"].([]any)) != 0 {
		t.Fatal("disabled connector exposed", o)
	}

	status, o = request(t, h.URL, key, "POST", "/v1/messages", store.Object{"connection_id": connection, "payload": store.Object{"to": "visitor", "type": "text", "text": store.Object{"body": "Blocked"}}}, "")
	expect(t, status, 422, o)
	status, o = request(t, h.URL, key, "GET", "/admin/v1/settings/whatsapp", nil, "")
	expect(t, status, 401, o)

	server.Config.AdminKey = store.ID("operator")
	server.Config.MetaAppSecret = "secret-must-not-leak"
	server.Config.MetaVerifyToken = "verify-must-not-leak"
	server.Config.PublicURL = "https://api.example.com/"
	status, o = request(t, h.URL, server.Config.AdminKey, "GET", "/admin/v1/settings/whatsapp", nil, "")
	expect(t, status, 200, o)
	raw, _ := json.Marshal(o)
	if str(object(o, "data"), "callback_url") != "https://api.example.com/hooks/meta" {
		t.Fatal("settings did not expose the canonical global callback")
	}

	if strings.Contains(string(raw), server.Config.MetaAppSecret) || strings.Contains(string(raw), server.Config.MetaVerifyToken) {
		t.Fatal("configuration leaked secrets")
	}

	status, o = request(t, h.URL, key, "GET", "/v1/overview", nil, "")
	expect(t, status, 200, o)

	if object(o, "data")["connections"] != float64(0) {
		t.Fatal("disabled channels counted", o)
	}
}

package api

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"wapo.local/server/internal/store"
)

func TestMetaProxyScopesResourcesAndCredentials(t *testing.T) {
	s, h, p, key := fixture(t)
	s.Config.MetaVersion = "v24.0"
	s.Config.PublicURL = h.URL
	c := store.Object{"id": "connection", "channel": "whatsapp", "external_id": "123456", "business_account_id": "654321", "access_token": s.Store.Seal("stored-provider-secret", p)}
	if e := s.Store.Put(context.Background(), p, "connections", "connection", c, true); e != nil {
		t.Fatal(e)
	}
	for kind, id := range map[string]string{"flow": "flow1", "template": "template1", "media": "media1", "dataset": "dataset1"} {
		if e := s.Store.Put(context.Background(), p, "meta_assets", kind+":"+id, store.Object{"id": id, "connection_id": "connection", "business_account_id": "654321"}, true); e != nil {
			t.Fatal(e)
		}
	}
	calls := 0
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") != "Bearer stored-provider-secret" || r.URL.Query().Has("access_token") || r.URL.Query().Has("appsecret_proof") {
			t.Error("wrong provider credentials")
		}
		write(w, 200, store.Object{"success": true, "data": []any{}, "paging": store.Object{"next": "https://graph.facebook.com/v24.0/x?after=next&access_token=secret"}})
	}))
	defer meta.Close()
	s.Meta.BaseURL = meta.URL
	cases := []struct{ method, path string }{
		{"GET", "654321/dataset"}, {"POST", "654321/dataset"}, {"POST", "dataset1/events"},
		{"GET", "123456/username"}, {"POST", "123456/username"}, {"DELETE", "123456/username"}, {"GET", "123456/username_suggestions"},
		{"POST", "123456/thread_control"}, {"POST", "123456/calls"}, {"POST", "123456/media"},
		{"GET", "media1"}, {"DELETE", "media1"},
		{"GET", "654321/message_templates"}, {"POST", "654321/message_templates"}, {"DELETE", "654321/message_templates"}, {"GET", "654321/message_templates/template1"},
		{"GET", "123456/whatsapp_business_profile"}, {"POST", "123456/whatsapp_business_profile"}, {"GET", "123456/call_permissions"},
		{"GET", "123456/block_users"}, {"POST", "123456/block_users"}, {"DELETE", "123456/block_users"},
		{"GET", "654321/flows"}, {"POST", "654321/flows"}, {"GET", "123456/flows"}, {"POST", "123456/flows"},
		{"GET", "flow1/assets"}, {"POST", "flow1/assets"}, {"GET", "flow1"}, {"POST", "flow1"}, {"DELETE", "flows/flow1"}, {"POST", "flow1/publish"}, {"POST", "flow1/deprecate"},
		{"GET", "654321/phone_numbers"}, {"GET", "123456"}, {"POST", "123456"},
	}
	for _, c := range cases {
		t.Run(c.method+" "+c.path, func(t *testing.T) {
			code, body := request(t, h.URL, key, c.method, "/meta/whatsapp/v24.0/"+c.path+"?access_token=caller-secret&appsecret_proof=caller-proof", store.Object{}, "")
			expect(t, code, 200, body)
			if strings.Contains(str(object(body, "paging"), "next"), "secret") {
				t.Fatal("paging leaked provider credential")
			}
		})
	}
	before := calls
	for _, path := range []string{"foreign/flows", "foreign/message_templates", "foreign/assets", "foreign", "foreign/media", "foreign/events"} {
		code, body := request(t, h.URL, key, "GET", "/meta/whatsapp/v24.0/"+path, nil, "")
		if code != 404 {
			t.Fatalf("unowned %s returned %d: %#v", path, code, body)
		}
	}
	if calls != before {
		t.Fatal("unowned resource reached provider")
	}
	for _, edge := range []string{"messages", "conversations", "contacts", "calls"} {
		code, body := request(t, h.URL, key, "GET", "/meta/whatsapp/v24.0/123456/"+edge, nil, "")
		expect(t, code, 200, body)
	}
}

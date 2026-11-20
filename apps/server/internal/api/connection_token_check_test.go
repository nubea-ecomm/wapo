package api

import (
	"testing"

	"wapo.local/server/internal/config"
	"wapo.local/server/internal/store"
)

func TestTokenCheckFlagsPermissionsGrantedToAnotherAccount(t *testing.T) {
	s := New(nil, config.Config{MetaAppID: "app", MetaAppSecret: "secret"})
	inspection := func(messagingTargets []any) store.Object {
		return store.Object{"data": store.Object{
			"is_valid": true, "app_id": "app",
			"scopes": []any{"whatsapp_business_management", "whatsapp_business_messaging"},
			"granular_scopes": []any{
				map[string]any{"scope": "whatsapp_business_management", "target_ids": []any{"111", "222"}},
				map[string]any{"scope": "whatsapp_business_messaging", "target_ids": messagingTargets},
			},
		}}
	}

	cases := []struct {
		name    string
		targets []any
		assets  []string
		want    string
	}{
		{"messaging on this account", []any{"222"}, []string{"222", "9001"}, "pass"},
		{"messaging on this phone", []any{"9001"}, []string{"222", "9001"}, "pass"},
		{"messaging without targets", nil, []string{"222", "9001"}, "pass"},
		{"messaging on an earlier signup", []any{"111"}, []string{"222", "9001"}, "fail"},
	}

	for _, tc := range cases {
		var status string

		var details store.Object

		s.checkConnectionToken(inspection(tc.targets), tc.assets, nil, func(_, _, got, _ string, extra store.Object) {
			status, details = got, extra
		})

		if status != tc.want {
			t.Errorf("%s: status %q, want %q", tc.name, status, tc.want)
		}

		if tc.want == "fail" && object(details, "granted_to")["whatsapp_business_messaging"] == nil {
			t.Errorf("%s: details do not name where messaging was granted: %v", tc.name, details)
		}
	}
}

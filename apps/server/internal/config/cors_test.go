package config

import "testing"

func TestLocalAliasesAndProductionOriginIsolation(t *testing.T) {
	local := Config{WebOrigin: "http://localhost:5173"}
	for _, origin := range []string{"http://localhost:5173", "http://127.0.0.1:5173", "http://[::1]:5173"} {
		if !local.AllowsOrigin(origin) {
			t.Errorf("local origin rejected: %s", origin)
		}
	}

	for _, origin := range []string{"http://127.0.0.1:9999", "https://127.0.0.1:5173", "http://localhost.evil:5173", "null", "http://localhost:5173/path", "http://user@localhost:5173"} {
		if local.AllowsOrigin(origin) {
			t.Errorf("unsafe origin accepted: %s", origin)
		}
	}

	deployed := Config{WebOrigin: "https://console.example,https://admin.example"}
	if !deployed.AllowsOrigin("https://admin.example") || deployed.AllowsOrigin("https://other.example") || deployed.AllowsOrigin("http://127.0.0.1:5173") {
		t.Fatal("production allowlist broken")
	}
}

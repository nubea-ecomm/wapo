package config

import "testing"

func TestFirstPartySubdomainOrigins(t *testing.T) {
	c := Config{WebOrigin: "http://localhost:5173"}
	for _, origin := range []string{"https://console.getwapo.dev", "https://getwapo.dev", "https://preview.console.getwapo.dev", "https://console.getwapo.dev:443", "http://127.0.0.1:5173"} {
		if !c.AllowsOrigin(origin) {
			t.Errorf("origin was denied: %s", origin)
		}
	}

	for _, origin := range []string{"https://evilgetwapo.dev", "https://console.getwapo.dev.evil.example", "https://console.getwapo.dev@evil.example", "http://console.getwapo.dev", "https://console.getwapo.dev:8443", "https://*.getwapo.dev", "https://console.getwapo.dev/path", "null"} {
		if c.AllowsOrigin(origin) {
			t.Errorf("unexpectedly allowed: %s", origin)
		}
	}

	c.CORSOrigins = "https://*.custom.example"
	if !c.AllowsOrigin("https://dashboard.custom.example") || c.AllowsOrigin("https://console.getwapo.dev") || c.AllowsOrigin("https://custom.example") {
		t.Fatal("custom allowlist did not replace the first-party defaults")
	}
}

func TestCORSConfigurationValidation(t *testing.T) {
	for _, origin := range []string{"*", "https://*", "https://*.dev", "https://pre*.getwapo.dev", "https://*.getwapo.dev/path", "https://user@*.getwapo.dev"} {
		if validCORSOrigin(origin) {
			t.Errorf("invalid origin configuration accepted: %s", origin)
		}
	}
}

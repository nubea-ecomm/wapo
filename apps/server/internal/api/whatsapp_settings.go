package api

import (
	"net/http"
	"strings"
	"wapo.local/server/internal/store"
)

func (s *Server) whatsappSettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		fail(w, 405, "method_not_allowed", "Use GET")
		return
	}
	// Expose presence only. App secrets and verification tokens never leave the server.
	write(w, 200, store.Object{"data": store.Object{
		"onboarding_ready": s.onboardingReady(),
		"public_url":       s.Config.PublicURL,
		"graph_version":    s.Config.MetaVersion,
		"public_https":     strings.HasPrefix(s.Config.PublicURL, "https://"),
		"credentials": store.Object{
			"META_APP_ID":                    s.Config.MetaAppID != "",
			"META_APP_SECRET":                s.Config.MetaAppSecret != "",
			"META_EMBEDDED_SIGNUP_CONFIG_ID": s.Config.MetaConfigID != "",
			"META_VERIFY_TOKEN":              s.Config.MetaVerifyToken != "",
		},
	}})
}

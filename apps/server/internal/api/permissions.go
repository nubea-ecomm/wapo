package api

import (
	"net/http"
	"strings"

	"wapo.local/server/internal/store"
)

func userProject(user store.ConsoleUser, id string) bool {
	if user.AllProjects {
		return true
	}

	for _, p := range user.ProjectIDs {
		if p == id {
			return true
		}
	}

	return false
}

func projectPermission(user store.ConsoleUser, r *http.Request) bool {
	if user.Role == "admin" {
		return true
	}

	path := r.URL.Path
	if user.Role == "billing" {
		return r.Method == "GET" && (path == "/v1/overview" || path == "/v1/me" || path == "/v1/project" || path == "/v1/channels" || path == "/v1/notification-settings")
	}

	if strings.Contains(path, "/api_keys") || (user.Role == "viewer" && strings.Contains(path, "/setup_links")) {
		return false
	}

	if user.Role == "viewer" {
		if r.Method == "POST" && strings.HasPrefix(path, "/v1/conversations/") && strings.HasSuffix(path, "/read") {
			return true
		}

		return r.Method == "GET"
	}

	if user.Role == "member" {
		return !((path == "/v1/project" || path == "/v1/notification-settings") && r.Method != "GET")
	}

	return false
}

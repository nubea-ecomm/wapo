package api

import (
	"net/http"
	"strings"

	"wapo.local/server/internal/channel"
	"wapo.local/server/internal/store"
)

func (s *Server) native(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/v1/"), "/"), "/")
	kind := parts[0]

	if kind == "logs" && len(parts) <= 2 {
		id := ""
		if len(parts) == 2 {
			id = parts[1]
		}

		s.logs(w, r, id)

		return
	}

	if kind == "project" && len(parts) == 1 {
		s.projectSettings(w, r)
		return
	}

	if kind == "notification-settings" && len(parts) == 1 {
		s.notificationSettings(w, r)
		return
	}

	id := ""
	if len(parts) > 1 {
		id = parts[1]
	}

	if len(parts) == 3 && parts[0] == "customers" && parts[2] == "metrics" {
		s.customerMetrics(w, r, id)
		return
	}

	if len(parts) == 5 && parts[0] == "connections" && parts[2] == "templates" && parts[4] == "history" {
		s.templateHistory(w, r, id, parts[3])
		return
	}

	if len(parts) == 3 && parts[0] == "connections" && parts[2] == "health" {
		s.connectionHealth(w, r, id)
		return
	}

	if len(parts) == 3 && parts[0] == "connections" && parts[2] == "business-profile" {
		s.businessProfile(w, r, id)
		return
	}

	if len(parts) == 3 && parts[2] == "templates" {
		if kind == "connections" {
			s.templates(w, r, id, "")
			return
		}

		if kind == "customers" {
			s.templates(w, r, "", id)
			return
		}
	}

	if kind == "deliveries" && len(parts) <= 3 {
		action := ""
		if len(parts) == 3 {
			action = parts[2]
		}

		s.deliveries(w, r, id, action)

		return
	}

	if kind == "conversations" && len(parts) <= 3 {
		sub := ""
		if len(parts) == 3 {
			sub = parts[2]
		}

		s.conversations(w, r, id, sub)

		return
	}

	if kind == "api_keys" && len(parts) <= 2 {
		s.apiKeys(w, r, project(r), id)
		return
	}

	if kind == "customers" && len(parts) == 3 && parts[2] == "setup_links" {
		s.setupLinks(w, r, id, false)
		return
	}

	if kind == "setup_links" && len(parts) == 2 {
		s.manageSetupLink(w, r, id)
		return
	}

	if len(parts) > 2 {
		fail(w, 404, "not_found", "Endpoint not found")
		return
	}

	if id != "" && (kind == "me" || kind == "overview" || kind == "events" || kind == "channels" || kind == "notification-settings") {
		fail(w, 404, "not_found", "Endpoint not found")
		return
	}

	switch kind {
	case "overview":
		s.overview(w, r)
	case "events":
		s.events(w, r)
	case "me":
		if r.Method != "GET" {
			fail(w, 405, "method_not_allowed", "Use GET")
			return
		}

		write(w, 200, store.Object{"data": store.Object{"project_id": project(r), "compatibility_mode": s.bridgeEnabled(r), "onboarding_ready": s.onboardingReady()}})
	case "channels":
		if r.Method != "GET" {
			fail(w, 405, "method_not_allowed", "Use GET")
			return
		}

		channels := []any{store.Object{"id": "whatsapp", "capabilities": s.Meta.Capabilities()}}
		if s.Config.ChannelEnabled("webchat") {
			channels = append(channels, store.Object{"id": "webchat", "capabilities": (channel.Webchat{}).Capabilities()})
		}

		write(w, 200, store.Object{"data": channels})
	case "customers":
		s.customers(w, r, id, false)
	case "connections":
		s.connections(w, r, id)
	case "messages":
		if r.Method == "POST" && id == "" {
			s.sendNative(w, r)
			return
		}

		if r.Method == "GET" && id == "" {
			s.list(w, r, "messages", map[string]string{"connection_id": r.URL.Query().Get("connection_id"), "direction": r.URL.Query().Get("direction"), "status": r.URL.Query().Get("status"), "channel": s.Config.ChannelFilter()})
			return
		}

		s.getOnly(w, r, "messages", id)
	case "webhooks":
		s.webhooks(w, r, id, "")
	default:
		fail(w, 404, "not_found", "Endpoint not found")
	}
}

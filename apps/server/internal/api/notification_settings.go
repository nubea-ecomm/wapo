package api

import (
	"net/http"
	"net/mail"
	"strings"

	"wapo.local/server/internal/store"
)

func (s *Server) notificationSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	settings, err := s.Store.NotificationSettings(r.Context(), project(r))
	if err != nil {
		dbError(w, err)
		return
	}

	projectUsers := []store.NotificationRecipient{}
	if user, consoleSession := r.Context().Value(consoleUserKey).(store.ConsoleUser); consoleSession && user.Role == "admin" {
		projectUsers, err = s.Store.ProjectNotificationRecipients(r.Context(), project(r))
		if err != nil {
			dbError(w, err)
			return
		}
	}

	switch r.Method {
	case "GET":
	case "PATCH":
		input, decodeErr := decode(r)
		if decodeErr != nil {
			fail(w, 400, "invalid_json", "Valid JSON required")
			return
		}

		if value, ok := input["recipients"]; ok {
			items, valid := value.([]any)
			if !valid || len(items) > 10 {
				fail(w, 422, "validation_error", "recipients must be an array of up to 10 email addresses")
				return
			}

			settings.Recipients = make([]string, 0, len(items))
			seen := map[string]bool{}

			for _, item := range items {
				address, valid := item.(string)
				address = strings.ToLower(strings.TrimSpace(address))
				parsed, parseErr := mail.ParseAddress(address)

				if !valid || parseErr != nil || parsed.Address != address || len(address) > 254 {
					fail(w, 422, "validation_error", "recipients contains an invalid email address")
					return
				}

				if !seen[address] {
					settings.Recipients = append(settings.Recipients, address)
					seen[address] = true
				}
			}
		}

		booleans := map[string]*bool{
			"whatsapp_disconnected":    &settings.WhatsAppDisconnected,
			"customer_needs_attention": &settings.CustomerNeedsAttention,
			"daily_stats":              &settings.DailyStats,
			"weekly_stats":             &settings.WeeklyStats,
		}
		for field, target := range booleans {
			if value, ok := input[field]; ok {
				boolean, valid := value.(bool)
				if !valid {
					fail(w, 422, "validation_error", field+" must be a boolean")
					return
				}

				*target = boolean
			}
		}

		if len(input) == 0 || len(input) > len(booleans)+1 {
			fail(w, 422, "validation_error", "Only notification preference fields are accepted")
			return
		}

		for field := range input {
			if field != "recipients" && booleans[field] == nil {
				fail(w, 422, "validation_error", "Unknown field: "+field)
				return
			}
		}

		if err = s.Store.SaveNotificationSettings(r.Context(), project(r), settings); err != nil {
			dbError(w, err)
			return
		}
	default:
		fail(w, 405, "method_not_allowed", "Use GET or PATCH")
		return
	}

	write(w, 200, store.Object{"data": store.Object{
		"recipients": settings.Recipients, "whatsapp_disconnected": settings.WhatsAppDisconnected,
		"customer_needs_attention": settings.CustomerNeedsAttention, "daily_stats": settings.DailyStats,
		"weekly_stats": settings.WeeklyStats, "smtp_configured": s.Config.SMTPHost != "", "project_users": projectUsers,
	}})
}

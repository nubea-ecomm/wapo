package api

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"

	"wapo.local/server/internal/store"
)

func messageTextValid(value string, max int) bool {
	return strings.TrimSpace(value) != "" && utf8.RuneCountInString(value) <= max
}

func (s *Server) validateConversationPayload(r *http.Request, c, payload store.Object) error {
	typ := str(payload, "type")
	switch typ {
	case "text":
		if !messageTextValid(str(object(payload, "text"), "body"), 4096) {
			return fmt.Errorf("text.body must contain 1–4096 characters")
		}
	case "image", "audio", "video", "document":
		media := object(payload, typ)
		bound, err := s.boundMetaAsset(r, str(media, "id"), "media")

		if err != nil || str(bound, "id") != str(c, "id") {
			return fmt.Errorf("media must be uploaded to this connection")
		}

		if utf8.RuneCountInString(str(media, "caption")) > 1024 {
			return fmt.Errorf("media caption exceeds 1024 characters")
		}
	case "contacts":
		contacts, _ := payload["contacts"].([]any)
		if len(contacts) == 0 || len(contacts) > 10 {
			return fmt.Errorf("contacts must contain 1–10 entries")
		}

		for _, value := range contacts {
			contact, _ := value.(map[string]any)
			if !messageTextValid(str(object(contact, "name"), "formatted_name"), 100) {
				return fmt.Errorf("contact formatted_name is required")
			}
		}
	case "interactive":
		interactive := object(payload, "interactive")
		if !messageTextValid(str(object(interactive, "body"), "text"), 1024) {
			return fmt.Errorf("interactive body must contain 1–1024 characters")
		}

		if utf8.RuneCountInString(str(object(interactive, "footer"), "text")) > 60 {
			return fmt.Errorf("interactive footer exceeds 60 characters")
		}

		if header := object(interactive, "header"); header != nil && (str(header, "type") != "text" || !messageTextValid(str(header, "text"), 60)) {
			return fmt.Errorf("interactive header must be text of 1–60 characters")
		}

		action := object(interactive, "action")
		switch str(interactive, "type") {
		case "button":
			buttons, _ := action["buttons"].([]any)
			if len(buttons) == 0 || len(buttons) > 3 {
				return fmt.Errorf("interactive buttons must contain 1–3 entries")
			}

			ids := map[string]bool{}

			for _, value := range buttons {
				button, _ := value.(map[string]any)
				reply := object(button, "reply")
				id := str(reply, "id")

				if str(button, "type") != "reply" || !messageTextValid(id, 256) || ids[id] || !messageTextValid(str(reply, "title"), 20) {
					return fmt.Errorf("invalid or duplicate reply button")
				}

				ids[id] = true
			}
		case "list":
			if !messageTextValid(str(action, "button"), 20) {
				return fmt.Errorf("list button text is required (max 20 characters)")
			}

			sections, _ := action["sections"].([]any)
			count := 0
			ids := map[string]bool{}

			for _, value := range sections {
				section, _ := value.(map[string]any)
				rows, _ := section["rows"].([]any)

				if len(rows) == 0 {
					return fmt.Errorf("list sections require rows")
				}

				for _, value := range rows {
					row, _ := value.(map[string]any)
					id := str(row, "id")

					if !messageTextValid(id, 200) || ids[id] || !messageTextValid(str(row, "title"), 24) || utf8.RuneCountInString(str(row, "description")) > 72 {
						return fmt.Errorf("invalid or duplicate list row")
					}

					ids[id] = true
					count++
				}
			}

			if count < 1 || count > 10 {
				return fmt.Errorf("list must contain 1–10 rows")
			}
		case "cta_url":
			parameters := object(action, "parameters")
			u, err := url.Parse(str(parameters, "url"))

			if str(action, "name") != "cta_url" || !messageTextValid(str(parameters, "display_text"), 20) || err != nil || u.Hostname() == "" || u.User != nil || (u.Scheme != "https" && u.Scheme != "http") {
				return fmt.Errorf("invalid CTA URL or label")
			}
		case "flow":
			parameters := object(action, "parameters")
			if str(action, "name") != "flow" || str(parameters, "flow_message_version") != "3" || !messageTextValid(str(parameters, "flow_cta"), 30) {
				return fmt.Errorf("invalid Flow parameters")
			}

			if err := s.verifyMetaAsset(r, c, str(parameters, "flow_id"), "flow"); err != nil {
				return fmt.Errorf("Flow does not belong to this WhatsApp account")
			}
		default:
			return fmt.Errorf("unsupported interactive message type")
		}
	default:
		return fmt.Errorf("unsupported conversation payload type")
	}

	return nil
}

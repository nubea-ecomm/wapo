package api

import (
	"encoding/json"
	"strings"

	"wapo.local/server/internal/store"
)

func contactEdits(input, fallback store.Object) (string, string, store.Object, string) {
	for field := range input {
		if field != "display_name" && field != "email" && field != "properties" && field != "connection_id" && field != "phone_number" && field != "use_provider_name" {
			return "", "", nil, "Unknown contact field: " + field
		}
	}

	display := str(fallback, "display_name")
	if value, ok := input["display_name"]; ok {
		display, ok = value.(string)
		display = strings.TrimSpace(display)

		if !ok || display == "" || len(display) > 120 {
			return "", "", nil, "display_name must contain 1 to 120 characters"
		}
	}

	email := str(fallback, "email")
	if value, ok := input["email"]; ok {
		email, ok = value.(string)
		email = strings.ToLower(strings.TrimSpace(email))

		if !ok || len(email) > 254 {
			return "", "", nil, "email must be a valid address"
		}

		if email != "" {
			var normalizeErr error

			email, normalizeErr = store.NormalizeEmail(email)
			if normalizeErr != nil {
				return "", "", nil, "email must be a valid address"
			}
		}
	}

	properties := object(fallback, "properties")
	if properties == nil {
		properties = store.Object{}
	}

	if value, ok := input["properties"]; ok {
		var valid bool

		properties, valid = value.(map[string]any)

		if !valid || len(properties) > 50 {
			return "", "", nil, "properties must be an object with up to 50 entries"
		}

		for key, value := range properties {
			if key == "" || len(key) > 100 || !validContactProperty(value) {
				return "", "", nil, "properties contain an invalid key or value"
			}
		}

		raw, _ := json.Marshal(properties)
		if len(raw) > 16<<10 {
			return "", "", nil, "properties must be at most 16 KiB"
		}
	}

	return display, email, properties, ""
}

func validContactProperty(value any) bool {
	switch value := value.(type) {
	case nil, bool, float64:
		return true
	case string:
		return len(value) <= 500
	default:
		return false
	}
}

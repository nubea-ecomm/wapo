package api

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

var setupThemeKeys = map[string]string{"primary_color": "--accent", "primary_foreground_color": "--accent-foreground", "background_color": "--bg", "text_color": "--ink", "muted_text_color": "--muted", "card_color": "--surface", "muted_color": "--muted-surface", "border_color": "--line", "secondary_color": "--secondary", "secondary_foreground_color": "--secondary-foreground", "destructive_color": "--destructive", "destructive_foreground_color": "--destructive-foreground"}

func (s *Server) setupOptions(input store.Object) (store.Object, error) {
	out := store.Object{}

	for _, key := range []string{"success_redirect_url", "failure_redirect_url"} {
		if value, ok := input[key]; ok {
			if value == nil {
				out[key] = ""
				continue
			}

			text, ok := value.(string)
			if !ok {
				return nil, fmt.Errorf("%s must be a URL", key)
			}

			if text != "" {
				if e := delivery.ValidateURL(text, s.Config.AllowPrivateWebhooks); e != nil {
					return nil, e
				}
			}

			out[key] = text
		}
	}

	if value, ok := input["language"]; ok && value != nil {
		language, ok := value.(string)
		if !ok || !methodIn(language, "en es pt hi id ar") {
			return nil, fmt.Errorf("Unsupported setup language")
		}

		out["language"] = language
	}

	if value, ok := input["theme_config"]; ok {
		if value == nil {
			out["theme_config"] = nil
		} else {
			theme, ok := value.(map[string]any)
			if !ok {
				return nil, fmt.Errorf("theme_config must be an object")
			}

			for key, color := range theme {
				text, ok := color.(string)
				if _, known := setupThemeKeys[key]; !known || !ok || !accentPattern.MatchString(text) {
					return nil, fmt.Errorf("Invalid theme color: %s", key)
				}
			}

			out["theme_config"] = theme
		}
	}

	if value, ok := input["allowed_origins"]; ok {
		values, ok := value.([]any)
		if !ok || len(values) > 20 {
			return nil, fmt.Errorf("allowed_origins must be an array of up to 20 origins")
		}

		origins := []string{}

		for _, value := range values {
			text, ok := value.(string)
			u, e := url.Parse(text)

			if !ok || e != nil || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || (u.Scheme != "https" && !(s.Config.AllowPrivateWebhooks && u.Scheme == "http")) {
				return nil, fmt.Errorf("allowed_origins must contain HTTPS origins")
			}

			origins = append(origins, u.Scheme+"://"+u.Host)
		}

		out["allowed_origins"] = origins
	}

	if value, ok := input["allowed_connection_types"]; ok {
		values, ok := value.([]any)
		if !ok || len(values) == 0 || len(values) > 2 {
			return nil, fmt.Errorf("allowed_connection_types must contain coexistence or dedicated")
		}

		seen := map[string]bool{}

		for _, value := range values {
			text, ok := value.(string)
			if !ok || (text != "coexistence" && text != "dedicated") || seen[text] {
				return nil, fmt.Errorf("Invalid connection types")
			}

			seen[text] = true
		}

		out["allowed_connection_types"] = values
	}

	if value, ok := input["expires_at"]; ok {
		text, ok := value.(string)
		at, e := time.Parse(time.RFC3339Nano, text)

		if !ok || e != nil {
			return nil, fmt.Errorf("expires_at must be an RFC3339 timestamp")
		}

		out["expires_at"] = at.UTC().Format(time.RFC3339Nano)
	}

	if value, ok := input["status"]; ok {
		text, ok := value.(string)
		if !ok || !methodIn(text, "active expired revoked") {
			return nil, fmt.Errorf("status must be active, expired or revoked")
		}

		out["status"] = text
	}

	if input["provision_phone_number"] == true {
		return nil, fmt.Errorf("Number provisioning requires a configured telephony provider")
	}

	return out, nil
}

func (s *Server) setupOrigin(o store.Object, origin string) bool {
	public, _ := url.Parse(s.Config.PublicURL)
	if origin == public.Scheme+"://"+public.Host {
		return true
	}

	values, _ := o["allowed_origins"].([]any)
	for _, value := range values {
		if value == origin {
			return true
		}
	}

	return false
}

func (s *Server) setupLinkOutput(o store.Object, p string) store.Object {
	out := clean(o)
	if token, e := s.Store.Unseal(str(o, "onboarding_token"), p); e == nil && token != "" {
		out["url"] = strings.TrimRight(s.Config.PublicURL, "/") + "/setup/" + url.PathEscape(p) + "/" + url.PathEscape(token)
	}

	if str(out, "status") == "completed" {
		out["status"] = "used"
	}

	return out
}

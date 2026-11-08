package api

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func TestSetupTranslationsHaveMatchingKeys(t *testing.T) {
	for language, messages := range setupMessages {
		if len(messages) != len(setupMessages["es"]) {
			t.Fatalf("%s has missing translations", language)
		}

		for key := range setupMessages["es"] {
			if messages[key] == "" {
				t.Errorf("%s is missing %s", language, key)
			}
		}
	}
}

func TestSetupLocalizedTemplate(t *testing.T) {
	for _, requested := range []string{"es", "en", "", "pt"} {
		t.Run("language_"+requested, func(t *testing.T) {
			project := `Store </script><script>alert("test")</script>`
			language, messages := localizedSetup(requested, project)

			if language != "es" && requested != "en" || requested == "en" && language != "en" {
				t.Fatalf("incorrect language fallback: %s", language)
			}

			var output bytes.Buffer

			if err := setupTemplate.Execute(&output, map[string]any{
				"Language": language, "Copy": messages, "Name": project,
				"Theme": "light", "Accent": "#171717", "Foreground": "#ffffff",
			}); err != nil {
				t.Fatal(err)
			}

			html := output.String()
			if !strings.Contains(html, `lang="`+language+`"`) || !strings.Contains(html, messages["appTitle"]) {
				t.Fatal("localized HTML was not rendered")
			}

			if strings.Contains(html, project) {
				t.Fatal("project name was not escaped")
			}

			_, script, found := strings.Cut(html, `type="application/json"`)
			if !found {
				t.Fatal("translation payload missing")
			}

			_, script, _ = strings.Cut(script, ">")
			payload, _, _ := strings.Cut(script, "</script>")

			var decoded map[string]string

			if err := json.Unmarshal([]byte(payload), &decoded); err != nil {
				t.Fatal(err)
			}

			if decoded["appDetailOne"] != messages["appDetailOne"] || !strings.Contains(decoded["appDetailOne"], project) {
				t.Fatal("project identity did not round-trip safely")
			}
		})
	}
}

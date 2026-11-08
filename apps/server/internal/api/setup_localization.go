package api

import (
	"encoding/json"
	"strings"
)

var setupMessages = map[string]map[string]string{
	"es": readSetupMessages("es"),
	"en": readSetupMessages("en"),
}

func readSetupMessages(language string) map[string]string {
	raw, err := setupFiles.ReadFile("setup/" + language + ".json")
	if err != nil {
		panic(err)
	}

	var messages map[string]string

	if err := json.Unmarshal(raw, &messages); err != nil {
		panic(err)
	}

	return messages
}

func localizedSetup(language, project string) (string, map[string]string) {
	if language != "en" {
		language = "es"
	}

	messages := make(map[string]string, len(setupMessages[language]))
	for key, value := range setupMessages[language] {
		messages[key] = strings.ReplaceAll(value, "{project}", project)
	}

	return language, messages
}

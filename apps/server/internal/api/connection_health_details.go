package api

import (
	"fmt"
	"strings"

	"wapo.local/server/internal/store"
)

func addHealthChecks(health store.Object, add func(string, string, string, string, store.Object), billing store.Object) {
	state := str(health, "can_send_message")
	status := "unknown"

	switch state {
	case "AVAILABLE":
		status = "pass"
	case "LIMITED":
		status = "warning"
	case "BLOCKED", "UNAVAILABLE":
		status = "fail"
	}

	message := "Meta no informó el estado de envío."
	if state != "" {
		message = "Estado informado por Meta: " + state
	}

	add("messaging_health", "Capacidad de envío", status, message, nil)

	entities, _ := health["entities"].([]any)
	for _, item := range entities {
		entity, _ := item.(map[string]any)
		errors, _ := entity["errors"].([]any)

		for i, item := range errors {
			issue, _ := item.(map[string]any)
			description := str(issue, "error_description")
			code := fmt.Sprint(issue["error_code"])
			isBilling := code == "141006" || code == "131042" || strings.Contains(strings.ToLower(description), "payment") || strings.Contains(strings.ToLower(description), "billing")
			label := "Restricción de Meta"

			if isBilling {
				billing["status"] = "attention_required"
				label = "Pagos en Meta"
			}

			add("meta_"+code+fmt.Sprint(i), label, "fail", description, store.Object{"code": issue["error_code"], "entity_type": entity["entity_type"], "possible_solution": issue["possible_solution"], "manage_url": billing["manage_url"]})
		}
	}
}

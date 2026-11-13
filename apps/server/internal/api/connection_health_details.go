package api

import (
	"fmt"
	"strings"

	"wapo.local/server/internal/store"
)

func addHealthChecks(health store.Object, add func(string, string, string, string, store.Object), billing store.Object) {
	issues := []store.Object{}
	ignoredCalling := false
	blocking := false
	entities, _ := health["entities"].([]any)

	for entityIndex, item := range entities {
		entity, _ := item.(map[string]any)
		errors, _ := entity["errors"].([]any)

		for i, item := range errors {
			issue, _ := item.(map[string]any)
			description := str(issue, "error_description")
			text := strings.ToLower(description)

			if strings.Contains(text, "sip") || strings.Contains(text, "whatsapp business calling") {
				ignoredCalling = true
				continue
			}

			code := fmt.Sprint(issue["error_code"])
			check := store.Object{
				"id":    fmt.Sprintf("meta_%s_%d_%d", code, entityIndex, i),
				"label": "Restricción de Meta", "status": "fail", "message": description,
				"code": issue["error_code"], "entity_type": entity["entity_type"],
				"possible_solution": issue["possible_solution"], "manage_url": billing["manage_url"],
				"provider_error": store.Object{"code": issue["error_code"], "message": description},
			}

			switch {
			case code == "141006" || code == "131042" || strings.Contains(text, "payment") || strings.Contains(text, "billing"):
				billing["status"] = "attention_required"
				check["label"] = "Pagos en Meta"
				check["status"] = "warning"
				check["message"] = "Meta reporta un problema de pagos que puede impedir los mensajes iniciados por la empresa. No implica que todos los mensajes estén bloqueados."
				check["possible_solution"] = "Abrí la cuenta de WhatsApp en Meta y revisá el método de pago, los cargos pendientes y los datos de facturación."
			case strings.Contains(text, "business verification"):
				check["label"] = "Verificación de la empresa"
				check["status"] = "warning"
				check["message"] = "Meta indica que la empresa no completó la verificación. Esto puede limitar funciones o capacidad; no confirma un bloqueo total de mensajes."
				check["possible_solution"] = "Abrí el Centro de seguridad del negocio en Meta y revisá si debés iniciar la verificación, aportar documentos o resolver una solicitud pendiente."
				check["manage_url"] = "https://business.facebook.com/settings/security"
			default:
				blocking = true

				if description == "" {
					check["message"] = "Meta reporta una restricción sin descripción. Revisá el detalle de la cuenta en Meta."
				}
			}

			issues = append(issues, check)
		}
	}

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
		message = "Estado informado por Meta: " + state + ". Este diagnóstico no realiza envíos de prueba."
	}

	if state == "BLOCKED" && !blocking {
		switch {
		case len(issues) > 0:
			status = "warning"
			message = "Meta devuelve BLOCKED en su diagnóstico general, pero las restricciones detalladas requieren revisión y no confirman que todos los mensajes estén bloqueados."
		case ignoredCalling:
			status = "unknown"
			message = "El diagnóstico general de Meta incluye funciones que Wapo no ofrece. No se pudo confirmar la capacidad de envío de mensajes."
		}
	}

	add("messaging_health", "Capacidad de envío", status, message, nil)

	for _, check := range issues {
		add(str(check, "id"), str(check, "label"), str(check, "status"), str(check, "message"), check)
	}
}

// healthEntities keeps the per-entity verdicts of Meta's `health_status` for
// the compatibility schema. Error descriptions join Meta's additional_info,
// except calling-only errors, which Wapo excludes everywhere.
func healthEntities(health store.Object) []any {
	out := []any{}
	entities, _ := health["entities"].([]any)

	for _, item := range entities {
		entity, _ := item.(map[string]any)
		state := compatSendState(str(entity, "can_send_message"))

		if state == "" || len(out) == 20 {
			continue
		}

		info := []any{}
		notes, _ := entity["additional_info"].([]any)
		errs, _ := entity["errors"].([]any)

		for _, note := range notes {
			if text, ok := note.(string); ok && text != "" {
				info = append(info, truncate(text, 500))
			}
		}

		for _, item := range errs {
			issue, _ := item.(map[string]any)
			text := str(issue, "error_description")

			if lower := strings.ToLower(text); text != "" && !strings.Contains(lower, "sip") && !strings.Contains(lower, "whatsapp business calling") {
				info = append(info, truncate(text, 500))
			}
		}

		o := store.Object{"entity_type": entity["entity_type"], "id": str(entity, "id"), "can_send_message": state}
		if len(info) > 0 {
			o["additional_info"] = info[:min(len(info), 10)]
		}

		out = append(out, o)
	}

	return out
}

func truncate(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}

	return s
}

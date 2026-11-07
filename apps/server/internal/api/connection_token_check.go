package api

import (
	"wapo.local/server/internal/store"
)

func (s *Server) checkConnectionToken(body store.Object, inspectionErr error, add func(string, string, string, string, store.Object)) {
	if s.Config.MetaAppID == "" || s.Config.MetaAppSecret == "" {
		add("access_token", "Permisos del token", "unknown", "Configurá la app de Meta para verificar los permisos del token.", nil)
		return
	}

	if inspectionErr != nil {
		add("access_token", "Permisos del token", "unknown", "Meta no permitió verificar el token.", nil)
		return
	}

	data := object(body, "data")
	valid, _ := data["is_valid"].(bool)

	if !valid || str(data, "app_id") != s.Config.MetaAppID {
		add("access_token", "Permisos del token", "fail", "El token venció, no es válido o pertenece a otra app. Reconectá el número.", nil)
		return
	}

	scopes, _ := data["scopes"].([]any)
	required := map[string]bool{"whatsapp_business_management": false, "whatsapp_business_messaging": false}

	for _, scope := range scopes {
		if key, ok := scope.(string); ok {
			if _, known := required[key]; known {
				required[key] = true
			}
		}
	}

	missing := []string{}

	for key, present := range required {
		if !present {
			missing = append(missing, key)
		}
	}

	if len(missing) > 0 {
		add("access_token", "Permisos del token", "fail", "Faltan permisos para administrar o enviar mensajes.", store.Object{"missing_permissions": missing})
		return
	}

	add("access_token", "Permisos del token", "pass", "El token es válido y tiene los permisos de WhatsApp requeridos.", nil)
}

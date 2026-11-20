package api

import (
	"slices"

	"wapo.local/server/internal/store"
)

func (s *Server) checkConnectionToken(body store.Object, assets []string, inspectionErr error, add func(string, string, string, string, store.Object)) {
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

	// A business that signed up more than once can grant a permission to the
	// WABA of an earlier attempt; Meta then rejects sends with error 10 even
	// though the token holds the scope.
	if elsewhere := scopesForOtherAccounts(data, assets); len(elsewhere) > 0 {
		add("access_token", "Permisos del token", "fail", "Meta otorgó permisos de WhatsApp a otra cuenta, no a la de este número. Reconectá el número en un solo intento.", store.Object{"connection_assets": assets, "granted_to": elsewhere})
		return
	}

	add("access_token", "Permisos del token", "pass", "El token es válido y tiene los permisos de WhatsApp requeridos.", nil)
}

// scopesForOtherAccounts returns, per WhatsApp permission, the accounts Meta
// granted it to when that list includes neither the connection's WABA nor its
// phone. A permission without targets applies to every asset and is not reported.
func scopesForOtherAccounts(data store.Object, assets []string) store.Object {
	elsewhere := store.Object{}

	if len(assets) == 0 {
		return elsewhere
	}

	granular, _ := data["granular_scopes"].([]any)

	for _, item := range granular {
		entry, _ := item.(map[string]any)
		scope := str(entry, "scope")

		if scope != "whatsapp_business_management" && scope != "whatsapp_business_messaging" {
			continue
		}

		raw, _ := entry["target_ids"].([]any)
		targets := []string{}

		for _, id := range raw {
			if value, ok := id.(string); ok {
				targets = append(targets, value)
			}
		}

		if len(targets) > 0 && !slices.ContainsFunc(assets, func(id string) bool { return slices.Contains(targets, id) }) {
			elsewhere[scope] = targets
		}
	}

	return elsewhere
}

func connectionAssets(c store.Object) []string {
	assets := []string{}

	for _, id := range []string{str(c, "business_account_id"), str(c, "external_id")} {
		if id != "" {
			assets = append(assets, id)
		}
	}

	return assets
}

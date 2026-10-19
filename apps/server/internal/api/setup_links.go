package api

import (
	"fmt"
	"net/http"
	"net/url"
	"time"

	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func (s *Server) onboardingReady() bool {
	return s.Config.MetaAppID != "" && s.Config.MetaConfigID != "" && s.Config.MetaAppSecret != "" && s.Config.MetaVerifyToken != ""
}

func (s *Server) setupLinks(w http.ResponseWriter, r *http.Request, customer string, compat bool) {
	p := project(r)
	if _, e := s.Store.Get(r.Context(), p, "customers", customer); e != nil {
		dbError(w, e)
		return
	}

	if r.Method == "GET" {
		rows, next, e := s.Store.List(r.Context(), p, "setup_links", map[string]string{"customer_id": customer}, r.URL.Query().Get("after"), pageLimit(r))
		if e != nil {
			dbError(w, e)
			return
		}

		for i, row := range rows {
			rows[i] = s.setupLinkOutput(row, p)
		}

		write(w, 200, store.Object{"data": rows, "meta": store.Object{"after": next, "has_more": next != ""}})

		return
	}

	if r.Method != "POST" {
		fail(w, 405, "method_not_allowed", "Use GET or POST")
		return
	}

	if !s.onboardingReady() {
		fail(w, 503, "onboarding_not_configured", "Configure META_APP_ID, META_APP_SECRET, META_EMBEDDED_SIGNUP_CONFIG_ID and META_VERIFY_TOKEN first")
		return
	}

	input, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON object required")
		return
	}

	if compat {
		input = object(input, "setup_link")
	}

	if input == nil {
		fail(w, 422, "validation_error", "setup_link object required")
		return
	}

	if input["provision_phone_number"] == true {
		fail(w, 501, "provisioning_not_implemented", "Automatic number provisioning requires a carrier integration. Use your existing number or the optional upstream bridge.")
		return
	}

	if mode := str(input, "meta_billing_mode"); mode != "" && mode != "customer_managed" {
		fail(w, 501, "billing_not_implemented", "Standalone onboarding currently supports customer_managed Meta billing only")
		return
	}

	types := []any{"coexistence", "dedicated"}

	if v, ok := input["allowed_connection_types"]; ok {
		var valid bool

		types, valid = v.([]any)

		if !valid || len(types) == 0 {
			fail(w, 422, "validation_error", "allowed_connection_types must be a nonempty array")
			return
		}

		for _, v := range types {
			if v != "coexistence" && v != "dedicated" {
				fail(w, 422, "validation_error", "Supported connection types: coexistence, dedicated")
				return
			}
		}
	}

	for _, field := range []string{"success_redirect_url", "failure_redirect_url"} {
		if raw := str(input, field); raw != "" {
			if e = delivery.ValidateURL(raw, s.Config.AllowPrivateWebhooks); e != nil {
				fail(w, 422, "invalid_redirect", e.Error())
				return
			}
		}
	}

	var reconnect store.Object

	if number := str(input, "reconnect_phone_number"); number != "" {
		reconnect, e = s.reconnectTarget(r, customer, number)
		if e != nil {
			dbError(w, e)
			return
		}

		types = []any{str(reconnect, "connection_type")}
	}

	token := store.ID("setup")
	id := store.Hash(token)
	now := time.Now().UTC()
	o := store.Object{"id": id, "customer_id": customer, "status": "active", "whatsapp_setup_status": "pending", "token_hash": id, "onboarding_token": s.Store.Seal(token, p), "allowed_connection_types": types, "meta_billing_mode": "customer_managed", "provision_phone_number": false, "created_at": now.Format(time.RFC3339Nano), "expires_at": now.Add(30 * 24 * time.Hour).Format(time.RFC3339Nano)}

	options, e := s.setupOptions(input)
	if e != nil {
		fail(w, 422, "validation_error", e.Error())
		return
	}

	for key, value := range options {
		o[key] = value
	}

	if reconnect != nil {
		o["reconnect_phone_number"] = reconnect["display_phone_number"]
		o["reconnect_connection_id"] = reconnect["id"]
		o["allowed_connection_types"] = types
	}

	// Hosted links do not expose project keys; project branding is read at view time.
	for _, field := range []string{"success_redirect_url", "failure_redirect_url", "language"} {
		o[field] = str(input, field)
	}

	if e = s.Store.Put(r.Context(), p, "setup_links", id, o, true); e != nil {
		dbError(w, e)
		return
	}

	out := clean(o)
	out["url"] = s.Config.PublicURL + "/setup/" + url.PathEscape(p) + "/" + token
	out["token"] = token
	write(w, 201, store.Object{"data": out})
}

func (s *Server) manageSetupLink(w http.ResponseWriter, r *http.Request, id string) {
	p := project(r)

	o, e := s.Store.Get(r.Context(), p, "setup_links", id)
	if e != nil {
		dbError(w, e)
		return
	}

	switch r.Method {
	case "GET":
		write(w, 200, store.Object{"data": s.setupLinkOutput(o, p)})
	case "PATCH":
		s.updateSetupLink(w, r, "", id)
	case "DELETE":
		o["status"] = "revoked"
		if e = s.Store.Put(r.Context(), p, "setup_links", id, o, false); e != nil {
			dbError(w, e)
			return
		}

		write(w, 200, store.Object{"data": s.setupLinkOutput(o, p)})
	default:
		fail(w, 405, "method_not_allowed", "Use GET or DELETE to revoke")
	}
}

func (s *Server) lookupSetup(r *http.Request) (store.Object, error) {
	o, e := s.Store.Get(r.Context(), r.PathValue("project"), "setup_links", store.Hash(r.PathValue("token")))
	if e != nil {
		return nil, e
	}

	expires, e := time.Parse(time.RFC3339Nano, str(o, "expires_at"))
	if e != nil || time.Now().After(expires) || str(o, "status") != "active" {
		return nil, fmt.Errorf("setup link expired, completed, or revoked")
	}

	return o, nil
}

func (s *Server) publicSetup(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	o, e := s.lookupSetup(r)
	if e != nil {
		fail(w, 410, "link_unavailable", "Setup link expired, completed, revoked or unknown")
		return
	}

	identity, e := s.readProject(r, r.PathValue("project"))
	if e != nil {
		dbError(w, e)
		return
	}

	write(w, 200, store.Object{"data": store.Object{"project_name": identity["name"], "branding": identity["branding"], "app_id": s.Config.MetaAppID, "config_id": s.Config.MetaConfigID, "graph_version": s.Config.MetaVersion, "allowed_connection_types": o["allowed_connection_types"], "expires_at": o["expires_at"]}})
}

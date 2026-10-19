package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"regexp"
	"time"

	"wapo.local/server/internal/store"
	"wapo.local/server/internal/templatesync"
)

var templateNamePattern = regexp.MustCompile(`^[a-z0-9_]+$`)

func (s *Server) templates(w http.ResponseWriter, r *http.Request, connectionID, customerID string) {
	if r.Method != "GET" && r.Method != "POST" {
		fail(w, 405, "method_not_allowed", "Use GET or POST")
		return
	}

	if customerID != "" {
		if _, e := s.Store.Get(r.Context(), project(r), "customers", customerID); e != nil {
			dbError(w, e)
			return
		}

		connectionID = r.URL.Query().Get("connection_id")
		if connectionID == "" {
			fail(w, 422, "connection_required", "Select a connection using connection_id")
			return
		}
	}

	c, e := s.Store.Get(r.Context(), project(r), "connections", connectionID)
	if e != nil {
		dbError(w, e)
		return
	}

	if customerID != "" && str(c, "customer_id") != customerID {
		fail(w, 404, "not_found", "Connection not found for this customer")
		return
	}

	if str(c, "channel") != "whatsapp" || !s.Config.ChannelEnabled("whatsapp") || !numeric(str(c, "business_account_id")) {
		fail(w, 422, "unsupported_connection", "Templates require a WhatsApp connection with a business account")
		return
	}

	token, e := s.Store.Unseal(str(c, "access_token"), project(r))
	if e != nil {
		fail(w, 500, "credential_error", "Cannot read connection credentials")
		return
	}

	token, tokenState, e := s.ensureConnectionToken(r.Context(), project(r), c, token)
	if e != nil {
		dbError(w, e)
		return
	}

	if tokenState.Expired {
		s.credentialExpired(w, r, c)
		return
	}

	query := url.Values{}

	var raw []byte

	if r.Method == "POST" {
		input, err := decode(r)
		if err != nil {
			fail(w, 400, "invalid_json", "Valid JSON required")
			return
		}

		if !templateNamePattern.MatchString(str(input, "name")) || len(str(input, "name")) > 512 {
			fail(w, 422, "validation_error", "name must use lowercase letters, numbers and underscores")
			return
		}

		if str(input, "language") == "" || !validTemplateCategory(str(input, "category")) {
			fail(w, 422, "validation_error", "language and category MARKETING, UTILITY or AUTHENTICATION are required")
			return
		}

		components, ok := input["components"].([]any)
		if !ok || len(components) == 0 {
			fail(w, 422, "validation_error", "components must be a nonempty array")
			return
		}

		allowed := store.Object{}

		for _, field := range []string{"name", "language", "category", "components", "allow_category_change", "parameter_format", "message_send_ttl_seconds"} {
			if value, ok := input[field]; ok {
				allowed[field] = value
			}
		}

		raw, _ = json.Marshal(allowed)
	} else {
		query.Set("fields", "id,name,language,status,category,components,quality_score,rejected_reason")
		query.Set("limit", "50")

		for _, field := range []string{"after", "name", "status", "category"} {
			if value := r.URL.Query().Get(field); value != "" {
				if len(value) > 1024 {
					fail(w, 422, "validation_error", "Template filter is too long")
					return
				}

				query.Set(field, value)
			}
		}
	}

	started := time.Now()

	status, body, e := s.Meta.Call(r.Context(), r.Method, s.Config.MetaVersion+"/"+url.PathEscape(str(c, "business_account_id"))+"/message_templates", token, raw, query.Encode())
	if e != nil {
		fail(w, 502, "provider_unavailable", "Could not reach Meta")
		return
	}

	var result store.Object

	if json.Unmarshal(body, &result) != nil {
		fail(w, 502, "provider_error", "Invalid response from Meta")
		return
	}

	if status < 200 || status >= 300 {
		if metaCredentialExpired(result) {
			s.credentialExpired(w, r, c)
			return
		}

		write(w, status, scrubLog(map[string]any(result)))

		return
	}

	if r.Method == "POST" {
		var submitted store.Object

		json.Unmarshal(raw, &submitted)

		for _, key := range []string{"id", "status", "category"} {
			if value, ok := result[key]; ok {
				submitted[key] = value
			}
		}

		if e = templatesync.Observe(r.Context(), s.Store, project(r), str(c, "business_account_id"), connectionID, submitted, "api", started, 0); e != nil {
			dbError(w, e)
			return
		}

		if _, e = s.Store.Pool.Exec(r.Context(), "UPDATE template_sync_accounts SET next_sync_at=now() WHERE project_id=$1 AND business_account_id=$2", project(r), str(c, "business_account_id")); e != nil {
			dbError(w, e)
			return
		}

		write(w, 201, store.Object{"data": result, "meta": store.Object{"business_account_id": c["business_account_id"], "connection_id": connectionID}})

		return
	}

	data, ok := result["data"].([]any)
	if !ok {
		fail(w, 502, "provider_error", "Meta did not return templates")
		return
	}

	for _, item := range data {
		snapshot, _ := item.(map[string]any)
		if e = templatesync.Observe(r.Context(), s.Store, project(r), str(c, "business_account_id"), connectionID, snapshot, "api", started, 0); e != nil {
			dbError(w, e)
			return
		}
	}

	paging := object(result, "paging")
	after := ""

	if str(paging, "next") != "" {
		after = str(object(paging, "cursors"), "after")
	}

	write(w, 200, store.Object{"data": data, "meta": store.Object{"has_more": after != "", "after": after, "business_account_id": c["business_account_id"], "connection_id": connectionID}})
}

func validTemplateCategory(value string) bool {
	return value == "MARKETING" || value == "UTILITY" || value == "AUTHENTICATION"
}

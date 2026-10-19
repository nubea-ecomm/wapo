package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) updateConnection(w http.ResponseWriter, r *http.Request, id string) {
	projectID := project(r)

	current, err := s.Store.Get(r.Context(), projectID, "connections", id)
	if err != nil {
		dbError(w, err)
		return
	}

	input, err := decode(r)
	if err != nil {
		fail(w, 400, "invalid_json", "Valid JSON object required")
		return
	}

	for key := range input {
		if key != "name" && key != "access_token" {
			fail(w, 422, "unsupported_setting", "Only name and access_token can be updated")
			return
		}
	}

	patch := store.Object{}
	credentialChanged := false

	if value, exists := input["name"]; exists {
		name, valid := value.(string)
		name = strings.TrimSpace(name)

		if !valid || name == "" || len(name) > 120 {
			fail(w, 422, "validation_error", "name must contain 1 to 120 bytes")
			return
		}

		patch["name"] = name
	}

	if value, exists := input["access_token"]; exists {
		token, valid := value.(string)
		if !valid || strings.TrimSpace(token) == "" {
			fail(w, 422, "validation_error", "access_token must be a nonempty string")
			return
		}

		if str(current, "channel") != "whatsapp" || !numeric(str(current, "external_id")) || !numeric(str(current, "business_account_id")) {
			fail(w, 422, "unsupported_connection", "Credential rotation requires a WhatsApp connection")
			return
		}

		status, body, callErr := s.Meta.Call(r.Context(), "GET", s.Config.MetaVersion+"/"+str(current, "external_id"), token, nil, "fields=id,display_phone_number,quality_rating,is_on_biz_app")
		if callErr != nil {
			fail(w, 502, "provider_unavailable", "Could not verify Meta phone number")
			return
		}

		if status != 200 {
			rawJSON(w, status, body)
			return
		}

		var details store.Object

		if json.Unmarshal(body, &details) != nil || str(details, "id") != str(current, "external_id") {
			fail(w, 422, "asset_verification_failed", "Token does not grant access to this phone number")
			return
		}

		accountStatus, accountBody, accountErr := s.Meta.Call(r.Context(), "GET", s.Config.MetaVersion+"/"+str(current, "business_account_id")+"/phone_numbers", token, nil, "fields=id&limit=100")

		var account struct {
			Data []store.Object `json:"data"`
		}

		owned := false

		if accountErr == nil && accountStatus == 200 && json.Unmarshal(accountBody, &account) == nil {
			for _, phone := range account.Data {
				if str(phone, "id") == str(current, "external_id") {
					owned = true
				}
			}
		}

		if !owned {
			fail(w, 422, "asset_verification_failed", "Cannot verify that the phone belongs to this business account")
			return
		}

		patch["access_token"] = s.Store.Seal(token, projectID)
		credentialChanged = true
		patch["credential_status"] = "valid"
		patch["access_token_updated_at"] = time.Now().UTC().Format(time.RFC3339Nano)
		patch["display_phone_number"] = details["display_phone_number"]
		patch["quality_rating"] = details["quality_rating"]
		patch["connection_type"] = "dedicated"

		if details["is_on_biz_app"] == true {
			patch["connection_type"] = "coexistence"
		}
	}

	if len(patch) == 0 {
		fail(w, 422, "validation_error", "name or access_token is required")
		return
	}

	rawPatch, _ := json.Marshal(patch)

	tx, err := s.Store.Pool.Begin(r.Context())
	if err != nil {
		dbError(w, err)
		return
	}
	defer tx.Rollback(r.Context())

	var raw []byte

	query := `UPDATE resources SET data=data||$3::jsonb WHERE project_id=$1 AND kind='connections' AND id=$2 RETURNING data`

	if credentialChanged {
		query = `UPDATE resources SET data=(data-'access_token_expires_at'-'access_token_refreshed_at'-'onboarding_error')||$3::jsonb WHERE project_id=$1 AND kind='connections' AND id=$2 RETURNING data`
	}

	err = tx.QueryRow(r.Context(), query, projectID, id, rawPatch).Scan(&raw)
	if err != nil {
		dbError(w, notFound(err))
		return
	}

	if credentialChanged {
		if _, err = tx.Exec(r.Context(), "DELETE FROM resources WHERE project_id=$1 AND kind='connection_health' AND id=$2", projectID, id); err != nil {
			dbError(w, err)
			return
		}
	}

	if err = tx.Commit(r.Context()); err != nil {
		dbError(w, err)
		return
	}

	var updated store.Object

	if json.Unmarshal(raw, &updated) != nil {
		fail(w, 500, "invalid_state", "Cannot read updated connection")
		return
	}

	write(w, 200, store.Object{"data": clean(updated)})
}

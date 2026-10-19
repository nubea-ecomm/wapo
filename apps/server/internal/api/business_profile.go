package api

import (
	"encoding/json"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"unicode/utf8"

	"wapo.local/server/internal/store"
)

var businessVerticals = map[string]bool{
	"ALCOHOL": true, "APPAREL": true, "AUTO": true, "BEAUTY": true,
	"EDU": true, "ENTERTAIN": true, "EVENT_PLAN": true, "FINANCE": true,
	"GOVT": true, "GROCERY": true, "HEALTH": true, "HOTEL": true,
	"NONPROFIT": true, "ONLINE_GAMBLING": true, "OTC_DRUGS": true,
	"OTHER": true, "PHYSICAL_GAMBLING": true, "PROF_SERVICES": true,
	"RESTAURANT": true, "RETAIL": true, "TRAVEL": true,
}

func (s *Server) businessProfile(w http.ResponseWriter, r *http.Request, connectionID string) {
	if r.Method != http.MethodGet && r.Method != http.MethodPatch {
		fail(w, http.StatusMethodNotAllowed, "method_not_allowed", "Use GET or PATCH")
		return
	}

	connection, err := s.Store.Get(r.Context(), project(r), "connections", connectionID)
	if err != nil {
		dbError(w, err)
		return
	}

	if str(connection, "channel") != "whatsapp" || str(connection, "external_id") == "" {
		fail(w, http.StatusUnprocessableEntity, "unsupported_channel", "Business profiles require a WhatsApp connection")
		return
	}

	token, err := s.Store.Unseal(str(connection, "access_token"), project(r))
	if err != nil {
		fail(w, http.StatusInternalServerError, "credential_error", "Cannot read connection credentials")
		return
	}

	path := s.Config.MetaVersion + "/" + url.PathEscape(str(connection, "external_id")) + "/whatsapp_business_profile"

	if r.Method == http.MethodPatch {
		input, decodeErr := decode(r)
		if decodeErr != nil {
			fail(w, http.StatusBadRequest, "invalid_json", "Valid JSON required")
			return
		}

		payload, validationErr := validateBusinessProfile(input)
		if validationErr != "" {
			fail(w, http.StatusUnprocessableEntity, "validation_error", validationErr)
			return
		}

		raw, _ := json.Marshal(payload)

		status, providerBody, callErr := s.Meta.Call(r.Context(), http.MethodPost, path, token, raw, "")
		if callErr != nil {
			fail(w, http.StatusBadGateway, "provider_unavailable", "Meta request failed")
			return
		}

		if status < 200 || status >= 300 {
			rawJSON(w, status, providerBody)
			return
		}
	}

	status, providerBody, err := s.Meta.Call(r.Context(), http.MethodGet, path, token, nil, "fields=about,address,description,email,profile_picture_url,websites,vertical")
	if err != nil {
		fail(w, http.StatusBadGateway, "provider_unavailable", "Meta request failed")
		return
	}

	if status < 200 || status >= 300 {
		rawJSON(w, status, providerBody)
		return
	}

	var response struct {
		Data []store.Object `json:"data"`
	}

	if json.Unmarshal(providerBody, &response) != nil || len(response.Data) == 0 {
		fail(w, http.StatusBadGateway, "provider_error", "Meta returned an invalid business profile")
		return
	}

	write(w, http.StatusOK, store.Object{"data": response.Data[0]})
}

func validateBusinessProfile(input store.Object) (store.Object, string) {
	allowed := map[string]int{"about": 139, "address": 256, "description": 512, "email": 128, "profile_picture_handle": 512}
	payload := store.Object{"messaging_product": "whatsapp"}

	for field, value := range input {
		if field == "websites" || field == "vertical" {
			continue
		}

		limit, ok := allowed[field]
		text, valid := value.(string)

		if !ok || !valid {
			return nil, "Unknown or invalid business profile field: " + field
		}

		text = strings.TrimSpace(text)
		if utf8.RuneCountInString(text) > limit || (field == "about" && text == "") {
			return nil, field + " has an invalid length"
		}

		if field == "email" && text != "" {
			address, err := mail.ParseAddress(text)
			if err != nil || address.Address != text {
				return nil, "email must be a valid address"
			}
		}

		payload[field] = text
	}

	if value, ok := input["vertical"]; ok {
		vertical, valid := value.(string)
		if !valid || !businessVerticals[vertical] {
			return nil, "vertical is not a supported business category"
		}

		payload["vertical"] = vertical
	}

	if value, ok := input["websites"]; ok {
		items, valid := value.([]any)
		if !valid || len(items) > 2 {
			return nil, "websites must contain up to two URLs"
		}

		websites := make([]string, 0, len(items))
		for _, item := range items {
			website, valid := item.(string)
			parsed, err := url.Parse(website)

			if !valid || err != nil || len(website) > 256 || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil {
				return nil, "websites must contain valid HTTP(S) URLs"
			}

			websites = append(websites, website)
		}

		payload["websites"] = websites
	}

	if len(payload) == 1 {
		return nil, "At least one business profile field is required"
	}

	return payload, ""
}

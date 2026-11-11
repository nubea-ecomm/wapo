package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"

	"wapo.local/server/internal/store"
)

// authorizedWABAs returns the WhatsApp Business Accounts a signup token was
// granted, using Meta's token inspection with the app access token.
func (s *Server) authorizedWABAs(ctx context.Context, token string) ([]string, error) {
	query := url.Values{"input_token": {token}}

	status, raw, e := s.Meta.Call(ctx, "GET", s.Config.MetaVersion+"/debug_token", s.Config.MetaAppID+"|"+s.Config.MetaAppSecret, nil, query.Encode())
	if e != nil || status != 200 {
		return nil, fmt.Errorf("Meta did not report the authorized WhatsApp account")
	}

	var inspection struct {
		Data struct {
			AppID  string `json:"app_id"`
			Scopes []struct {
				Scope     string   `json:"scope"`
				TargetIDs []string `json:"target_ids"`
			} `json:"granular_scopes"`
		} `json:"data"`
	}

	if json.Unmarshal(raw, &inspection) != nil || inspection.Data.AppID != s.Config.MetaAppID {
		return nil, fmt.Errorf("Meta did not report the authorized WhatsApp account")
	}

	seen := map[string]bool{}

	var accounts []string

	for _, scope := range inspection.Data.Scopes {
		if scope.Scope != "whatsapp_business_management" {
			continue
		}

		for _, id := range scope.TargetIDs {
			if numeric(id) && !seen[id] {
				seen[id] = true
				accounts = append(accounts, id)
			}
		}
	}

	if len(accounts) == 0 {
		return nil, fmt.Errorf("Meta reported no authorized WhatsApp account")
	}

	return accounts, nil
}

// resolveSetupPhone finds the authorized WABA and phone a signup completed.
// The session event may omit both; then every WABA granted to the token is
// searched. A business that onboarded more than once can have several, so
// when no phone ID is known the phones matching the chosen mode are preferred.
// It returns an error code and message instead of guessing between candidates.
func (s *Server) resolveSetupPhone(ctx context.Context, token, waba, phoneID, mode string) (string, store.Object, string, string) {
	accounts := []string{waba}

	if waba == "" {
		var e error

		if accounts, e = s.authorizedWABAs(ctx, token); e != nil {
			return "", nil, "waba_discovery_failed", e.Error()
		}
	}

	type candidate struct {
		waba  string
		phone store.Object
	}

	var all []candidate

	for _, account := range accounts {
		// Discover phone IDs server-side. Coexistence completion events may omit them.
		status, raw, e := s.Meta.Call(ctx, "GET", s.Config.MetaVersion+"/"+account+"/phone_numbers", token, nil, "fields=id,display_phone_number,quality_rating,is_on_biz_app&limit=100")
		if e != nil || status != 200 {
			return "", nil, "asset_verification_failed", "Cannot read the authorized WABA phone numbers"
		}

		var listing struct {
			Data []store.Object `json:"data"`
		}

		if json.Unmarshal(raw, &listing) != nil {
			return "", nil, "asset_verification_failed", "Invalid Meta phone list"
		}

		for _, phone := range listing.Data {
			if phoneID == "" || str(phone, "id") == phoneID {
				all = append(all, candidate{account, phone})
			}
		}
	}

	matches := all

	if phoneID == "" && len(all) > 1 {
		matches = nil

		for _, c := range all {
			if onApp, _ := c.phone["is_on_biz_app"].(bool); onApp == (mode == "coexistence") {
				matches = append(matches, c)
			}
		}
	}

	if len(matches) != 1 {
		return "", nil, "ambiguous_phone_number", "Select a phone number belonging to the authorized WABA"
	}

	return matches[0].waba, matches[0].phone, "", ""
}

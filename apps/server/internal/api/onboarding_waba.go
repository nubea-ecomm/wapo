package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
)

// authorizedWABA returns the single WhatsApp Business Account a signup token was
// granted, using Meta's token inspection with the app access token.
func (s *Server) authorizedWABA(ctx context.Context, token string) (string, error) {
	query := url.Values{"input_token": {token}}

	status, raw, e := s.Meta.Call(ctx, "GET", s.Config.MetaVersion+"/debug_token", s.Config.MetaAppID+"|"+s.Config.MetaAppSecret, nil, query.Encode())
	if e != nil || status != 200 {
		return "", fmt.Errorf("Meta did not report the authorized WhatsApp account")
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
		return "", fmt.Errorf("Meta did not report the authorized WhatsApp account")
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

	if len(accounts) != 1 {
		return "", fmt.Errorf("Expected one authorized WhatsApp account, Meta reported %d", len(accounts))
	}

	return accounts[0], nil
}

package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"time"

	"wapo.local/server/internal/store"
)

type connectionTokenState struct {
	Expired   bool
	ExpiresAt time.Time
	Refreshed bool
}

// ensureConnectionToken refreshes valid expiring system-user credentials before
// they enter their final seven days. Meta cannot refresh an already expired token.
func (s *Server) ensureConnectionToken(ctx context.Context, project string, connection store.Object, token string) (string, connectionTokenState, error) {
	state := connectionTokenState{}
	if token == "" || s.Config.MetaAppID == "" || s.Config.MetaAppSecret == "" {
		return token, state, nil
	}
	query := url.Values{"input_token": {token}}
	status, raw, err := s.Meta.Call(ctx, "GET", s.Config.MetaVersion+"/debug_token", s.Config.MetaAppID+"|"+s.Config.MetaAppSecret, nil, query.Encode())
	if err != nil || status != 200 {
		return token, state, nil
	}
	var response store.Object
	if json.Unmarshal(raw, &response) != nil {
		return token, state, nil
	}
	data := object(response, "data")
	valid, _ := data["is_valid"].(bool)
	expiresAt := tokenExpiration(data)
	state.ExpiresAt = expiresAt
	if !valid || str(data, "app_id") != s.Config.MetaAppID || (!expiresAt.IsZero() && !expiresAt.After(time.Now())) {
		state.Expired = true
		s.markConnectionCredential(ctx, project, connection, "expired", expiresAt)
		return token, state, nil
	}
	if expiresAt.IsZero() || expiresAt.After(time.Now().Add(7*24*time.Hour)) {
		s.markConnectionCredential(ctx, project, connection, "valid", expiresAt)
		return token, state, nil
	}
	refresh := url.Values{
		"grant_type":                   {"fb_exchange_token"},
		"client_id":                    {s.Config.MetaAppID},
		"client_secret":                {s.Config.MetaAppSecret},
		"set_token_expires_in_60_days": {"true"},
		"fb_exchange_token":            {token},
	}
	status, raw, err = s.Meta.Call(ctx, "GET", s.Config.MetaVersion+"/oauth/access_token", "", nil, refresh.Encode())
	if err != nil || status != 200 {
		return token, state, nil
	}
	var refreshed store.Object
	if json.Unmarshal(raw, &refreshed) != nil || str(refreshed, "access_token") == "" {
		return token, state, nil
	}
	newToken := str(refreshed, "access_token")
	newExpiry := expirationFromSeconds(refreshed["expires_in"])
	patch := store.Object{
		"access_token":              s.Store.Seal(newToken, project),
		"credential_status":         "valid",
		"access_token_refreshed_at": time.Now().UTC().Format(time.RFC3339Nano),
	}
	if !newExpiry.IsZero() {
		patch["access_token_expires_at"] = newExpiry.Format(time.RFC3339Nano)
	}
	if _, err = s.Store.Patch(ctx, project, "connections", str(connection, "id"), patch); err != nil {
		return token, state, err
	}
	connection["access_token"] = patch["access_token"]
	connection["credential_status"] = "valid"
	connection["access_token_expires_at"] = patch["access_token_expires_at"]
	state.ExpiresAt = newExpiry
	state.Refreshed = true
	return newToken, state, nil
}

func (s *Server) markConnectionCredential(ctx context.Context, project string, connection store.Object, status string, expiresAt time.Time) {
	formattedExpiry := ""
	if !expiresAt.IsZero() {
		formattedExpiry = expiresAt.UTC().Format(time.RFC3339Nano)
	}
	if str(connection, "id") == "" || (str(connection, "credential_status") == status && str(connection, "access_token_expires_at") == formattedExpiry) {
		return
	}
	patch := store.Object{"credential_status": status}
	if formattedExpiry != "" {
		patch["access_token_expires_at"] = formattedExpiry
	}
	if _, err := s.Store.Patch(ctx, project, "connections", str(connection, "id"), patch); err == nil {
		connection["credential_status"] = status
		if formattedExpiry != "" {
			connection["access_token_expires_at"] = formattedExpiry
		}
	}
}

func tokenExpiration(data store.Object) time.Time {
	expires := unixValue(data["expires_at"])
	dataExpires := unixValue(data["data_access_expires_at"])
	if dataExpires > 0 && (expires == 0 || dataExpires < expires) {
		expires = dataExpires
	}
	if expires <= 0 {
		return time.Time{}
	}
	return time.Unix(expires, 0).UTC()
}

func expirationFromSeconds(value any) time.Time {
	seconds := unixValue(value)
	if seconds <= 0 {
		return time.Time{}
	}
	return time.Now().UTC().Add(time.Duration(seconds) * time.Second)
}

func unixValue(value any) int64 {
	switch number := value.(type) {
	case float64:
		return int64(number)
	case json.Number:
		result, _ := number.Int64()
		return result
	case int64:
		return number
	case int:
		return int64(number)
	}
	return 0
}

func metaCredentialExpired(result store.Object) bool {
	provider := object(result, "error")
	return unixValue(provider["code"]) == 190
}

func (s *Server) credentialExpired(w http.ResponseWriter, r *http.Request, connection store.Object) {
	s.markConnectionCredential(r.Context(), project(r), connection, "expired", time.Time{})
	fail(w, 409, "credential_expired", "WhatsApp credentials expired. Reconnect the number to continue.")
}

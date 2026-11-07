package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sync"
	"time"

	"wapo.local/server/internal/store"
)

const (
	tokenInspectionTTL   = 5 * time.Minute
	tokenInspectionLimit = 1024
)

type tokenInspectionEntry struct {
	ready   chan struct{}
	raw     []byte
	err     error
	expires time.Time
}

type tokenInspectionCache struct {
	mu      sync.Mutex
	entries map[string]*tokenInspectionEntry
}

func (s *Server) tokenInspectionKey(project, token string) string {
	return store.Hash(project + "\x00" + s.Meta.BaseURL + "\x00" + s.Config.MetaVersion + "\x00" + s.Config.MetaAppID + "\x00" + s.Config.MetaAppSecret + "\x00" + token)
}

func (s *Server) invalidateTokenInspection(project, token string) {
	s.tokenChecks.mu.Lock()
	defer s.tokenChecks.mu.Unlock()

	delete(s.tokenChecks.entries, s.tokenInspectionKey(project, token))
}

// inspectConnectionToken coalesces concurrent checks and caches only valid,
// app-matching responses. Cache keys never contain plaintext credentials.
func (s *Server) inspectConnectionToken(ctx context.Context, project, token string) (store.Object, error) {
	key := s.tokenInspectionKey(project, token)
	c := &s.tokenChecks
	c.mu.Lock()
	if entry := c.entries[key]; entry != nil && (entry.expires.IsZero() || time.Now().Before(entry.expires)) {
		c.mu.Unlock()

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-entry.ready:
			var data store.Object

			if entry.err != nil {
				return nil, entry.err
			}

			err := json.Unmarshal(entry.raw, &data)

			return data, err
		}
	}

	if c.entries == nil {
		c.entries = make(map[string]*tokenInspectionEntry)
	}

	// Evict completed checks, never an in-flight request, to bound memory.
	for existing, entry := range c.entries {
		if len(c.entries) < tokenInspectionLimit {
			break
		}

		if !entry.expires.IsZero() {
			delete(c.entries, existing)
		}
	}

	entry := &tokenInspectionEntry{ready: make(chan struct{})}
	if len(c.entries) < tokenInspectionLimit {
		c.entries[key] = entry
	}

	c.mu.Unlock()

	query := url.Values{"input_token": {token}}
	status, raw, err := s.Meta.Call(ctx, "GET", s.Config.MetaVersion+"/debug_token", s.Config.MetaAppID+"|"+s.Config.MetaAppSecret, nil, query.Encode())
	data := store.Object{}

	if err != nil || status != 200 || json.Unmarshal(raw, &data) != nil || data["data"] == nil {
		err = fmt.Errorf("Meta token inspection unavailable")
	}

	expires := time.Now().Add(tokenInspectionTTL)
	if expiry := tokenExpiration(object(data, "data")); !expiry.IsZero() && expiry.Before(expires) {
		expires = expiry
	}

	c.mu.Lock()
	entry.raw, entry.err, entry.expires = raw, err, expires
	valid, _ := object(data, "data")["is_valid"].(bool)

	if c.entries[key] == entry && (err != nil || !valid || str(object(data, "data"), "app_id") != s.Config.MetaAppID || !expires.After(time.Now())) {
		delete(c.entries, key)
	}

	close(entry.ready)
	c.mu.Unlock()

	return data, err
}

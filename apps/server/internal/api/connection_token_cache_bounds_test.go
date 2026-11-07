package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"wapo.local/server/internal/config"
	"wapo.local/server/internal/store"
)

func TestTokenInspectionCacheBoundsAndExpiration(t *testing.T) {
	expires := time.Now().Add(time.Minute).Unix()
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		write(w, 200, store.Object{"data": store.Object{"is_valid": true, "app_id": "app", "data_access_expires_at": expires}})
	}))

	defer meta.Close()

	s := New(nil, config.Config{MetaAppID: "app", MetaAppSecret: "secret", MetaVersion: "v24.0"})
	s.Meta.BaseURL = meta.URL
	s.tokenChecks.entries = make(map[string]*tokenInspectionEntry)

	for range tokenInspectionLimit {
		s.tokenChecks.entries[store.ID("cached")] = &tokenInspectionEntry{expires: time.Now().Add(time.Minute)}
	}

	if _, err := s.inspectConnectionToken(context.Background(), "project", "token"); err != nil {
		t.Fatal(err)
	}

	if len(s.tokenChecks.entries) > tokenInspectionLimit {
		t.Fatal("token cache exceeded its size limit")
	}

	entry := s.tokenChecks.entries[s.tokenInspectionKey("project", "token")]
	if entry == nil || !entry.expires.Equal(time.Unix(expires, 0)) {
		t.Fatal("inspection cache outlived data-access expiration")
	}
}

func TestTokenInspectionWaiterCanCancel(t *testing.T) {
	s := New(nil, config.Config{})
	s.tokenChecks.entries = map[string]*tokenInspectionEntry{
		s.tokenInspectionKey("project", "token"): {ready: make(chan struct{})},
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	if _, err := s.inspectConnectionToken(ctx, "project", "token"); !errors.Is(err, context.Canceled) {
		t.Fatalf("waiting inspection ignored cancellation: %v", err)
	}
}

func TestTokenInspectionInvalidationDuringFlightDoesNotRestoreCache(t *testing.T) {
	started := make(chan struct{})
	release := make(chan struct{})
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(started)
		<-release
		write(w, 200, store.Object{"data": store.Object{"is_valid": true, "app_id": "app"}})
	}))

	defer meta.Close()

	s := New(nil, config.Config{MetaAppID: "app", MetaAppSecret: "secret", MetaVersion: "v24.0"})
	s.Meta.BaseURL = meta.URL
	done := make(chan error, 1)

	go func() {
		_, err := s.inspectConnectionToken(context.Background(), "project", "token")
		done <- err
	}()

	<-started
	s.invalidateTokenInspection("project", "token")
	close(release)

	if err := <-done; err != nil {
		t.Fatal(err)
	}

	if len(s.tokenChecks.entries) != 0 {
		t.Fatal("in-flight response restored invalidated cache")
	}
}

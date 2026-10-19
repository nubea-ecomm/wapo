package api

import (
	"context"
	"testing"
	"time"
	"wapo.local/server/internal/store"
)

func TestConnectionHealthWorkerSelectsByReportCheckTime(t *testing.T) {
	s, _, p, _ := fixture(t)
	ctx := context.Background()
	for _, id := range []string{"missing", "stale", "fresh"} {
		if err := s.Store.Put(ctx, p, "connections", id, store.Object{"id": id, "channel": "whatsapp", "status": "connected", "external_id": id, "business_account_id": "health-worker-account"}, true); err != nil {
			t.Fatal(err)
		}
	}
	for id, age := range map[string]time.Duration{"stale": -11 * time.Minute, "fresh": -time.Minute} {
		if err := s.Store.Put(ctx, p, "connection_health", id, store.Object{"checked_at": time.Now().Add(age).UTC().Format(time.RFC3339Nano)}, true); err != nil {
			t.Fatal(err)
		}
	}
	check := func(wantStale bool) {
		t.Helper()
		rows, err := s.Store.Pool.Query(ctx, dueConnectionHealthQuery)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		found := map[string]bool{}
		for rows.Next() {
			var project string
			var c store.Object
			if err = rows.Scan(&project, &c); err != nil {
				t.Fatal(err)
			}
			if project == p {
				found[str(c, "id")] = true
			}
		}
		if err = rows.Err(); err != nil {
			t.Fatal(err)
		}
		if !found["missing"] || found["fresh"] || found["stale"] != wantStale {
			t.Fatalf("unexpected due connections: %v", found)
		}
	}
	check(true)
	// Updating a cached report must postpone its next check, regardless of created_at.
	if err := s.Store.Put(ctx, p, "connection_health", "stale", store.Object{"checked_at": time.Now().UTC().Format(time.RFC3339Nano)}, false); err != nil {
		t.Fatal(err)
	}
	check(false)
}

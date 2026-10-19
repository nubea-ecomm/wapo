package templatesync

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

func Text(o store.Object, key string) string {
	v := o[key]
	if v == nil {
		return ""
	}

	return fmt.Sprint(v)
}

// Observe applies partial snapshots under a per-template lock. Poll snapshots started
// before a newer observation and webhook timestamps older than the last webhook are ignored.
func Observe(ctx context.Context, s *store.Store, p, waba, connection string, input store.Object, source string, started time.Time, providerTime int64) error {
	filtered := store.Object{}

	for _, field := range []string{"id", "name", "language", "status", "category", "components", "quality_score", "rejected_reason", "scheduled_category", "category_update_at"} {
		if value, ok := input[field]; ok {
			filtered[field] = value
		}
	}

	input = filtered
	id := Text(input, "id")

	if id == "" || waba == "" {
		return nil
	}

	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(context.Background())

	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", p+":"+waba+":"+id); e != nil {
		return e
	}

	var (
		raw                    []byte
		revision, lastProvider int64
		observed               time.Time
	)

	e = tx.QueryRow(ctx, "SELECT data,revision,observed_at,provider_event_at FROM template_states WHERE project_id=$1 AND business_account_id=$2 AND template_id=$3 FOR UPDATE", p, waba, id).Scan(&raw, &revision, &observed, &lastProvider)
	fresh := e == pgx.ErrNoRows

	if e != nil && !fresh {
		return e
	}

	if !fresh && (((source == "poll" || source == "api") && started.Before(observed)) || (providerTime > 0 && providerTime < lastProvider)) {
		return nil
	}

	previous := store.Object{}
	if !fresh {
		if e = json.Unmarshal(raw, &previous); e != nil {
			return e
		}
	}

	current := store.Object{}
	for k, v := range previous {
		current[k] = v
	}

	for k, v := range input {
		current[k] = v
	}

	current["id"] = id
	if input["category"] != nil && current["scheduled_category"] != nil && Text(current, "category") == Text(current, "scheduled_category") {
		current["scheduled_category"] = nil
		current["category_update_at"] = nil
		input["scheduled_category"] = nil
	}

	// Do not emit creation events for baseline discovery through an API read or poll.
	changes := []string{}
	fields := map[string]string{"status": "status_changed", "category": "category_changed", "quality_score": "quality_changed", "scheduled_category": "category_change_scheduled"}

	for field, event := range fields {
		if value, ok := input[field]; ok {
			if field == "scheduled_category" && value == nil {
				continue
			}

			before, _ := json.Marshal(previous[field])
			after, _ := json.Marshal(value)

			if string(before) != string(after) && (!fresh || source == "webhook") {
				changes = append(changes, event)
			}
		}
	}

	if len(changes) > 0 {
		revision++
	}

	if revision == 0 {
		revision = 1
	}

	raw, _ = json.Marshal(current)

	if providerTime < lastProvider {
		providerTime = lastProvider
	}

	_, e = tx.Exec(ctx, `INSERT INTO template_states(project_id,business_account_id,template_id,data,revision,observed_at,provider_event_at) VALUES($1,$2,$3,$4,$5,now(),$6) ON CONFLICT(project_id,business_account_id,template_id) DO UPDATE SET data=EXCLUDED.data,revision=EXCLUDED.revision,observed_at=now(),provider_event_at=EXCLUDED.provider_event_at`, p, waba, id, raw, revision, providerTime)
	if e != nil {
		return e
	}

	// Fan out WABA changes to each currently bound connection, plus project subscriptions.
	if len(changes) > 0 {
		rows, err := tx.Query(ctx, "SELECT id FROM resources WHERE project_id=$1 AND kind='connections' AND data->>'business_account_id'=$2 AND data->>'channel'='whatsapp'", p, waba)
		if err != nil {
			return err
		}

		connections := []string{}

		for rows.Next() {
			var c string

			if err = rows.Scan(&c); err != nil {
				rows.Close()
				return err
			}

			connections = append(connections, c)
		}

		rows.Close()

		if rows.Err() != nil {
			return rows.Err()
		}

		for _, change := range changes {
			name := "whatsapp.template." + change
			payload := store.Object{"event": name, "business_account_id": waba, "occurred_at": time.Now().UTC().Format(time.RFC3339Nano), "data": store.Object{"template": current, "previous": previous, "revision": revision, "source": source}}
			// One event has project deliveries and all matching phone subscriptions.
			if e = recordAccountEvent(ctx, tx, p, waba, id, revision, name, payload, connections); e != nil {
				return e
			}
		}
	}

	if _, e = tx.Exec(ctx, "INSERT INTO template_sync_accounts(project_id,business_account_id) VALUES($1,$2) ON CONFLICT(project_id,business_account_id) DO UPDATE SET next_sync_at=CASE WHEN $3 THEN least(template_sync_accounts.next_sync_at,now()+interval '1 minute') ELSE template_sync_accounts.next_sync_at END", p, waba, Text(current, "status") == "PENDING"); e != nil {
		return e
	}

	return tx.Commit(ctx)
}

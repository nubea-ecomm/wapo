package templatesync

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func recordAccountEvent(ctx context.Context, tx pgx.Tx, p, waba, id string, revision int64, name string, payload store.Object, connections []string) error {
	source := fmt.Sprintf("template:%s:%s:%d:%s", waba, id, revision, name)
	if e := delivery.RecordTx(ctx, tx, p, source, name, payload, "", nil); e != nil {
		return e
	}

	rows, e := tx.Query(ctx, "SELECT id,data FROM resources WHERE project_id=$1 AND kind='webhooks' AND data->>'connection_id'=ANY($2::text[])", p, connections)
	if e != nil {
		return e
	}

	ids := []string{}

	for rows.Next() {
		var (
			id  string
			raw []byte
		)

		if e = rows.Scan(&id, &raw); e != nil {
			rows.Close()
			return e
		}

		var o store.Object

		if e = json.Unmarshal(raw, &o); e != nil {
			rows.Close()
			return e
		}

		if o["active"] == false {
			continue
		}

		events, _ := o["events"].([]any)
		for _, event := range events {
			if event == name || event == "*" {
				ids = append(ids, id)
				break
			}
		}
	}

	rows.Close()

	if rows.Err() != nil {
		return rows.Err()
	}

	for _, sub := range ids {
		_, e = tx.Exec(ctx, "INSERT INTO deliveries(id,project_id,event_id,subscription_id) SELECT $1,$2,id,$3 FROM events WHERE project_id=$2 AND source_key=$4 ON CONFLICT DO NOTHING", store.ID("del"), p, sub, source)
		if e != nil {
			return e
		}
	}

	return nil
}

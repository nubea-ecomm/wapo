package store

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Patch changes only selected fields so concurrent message ingestion cannot be overwritten by a UI edit.
func (s *Store) Patch(ctx context.Context, p, kind, id string, fields Object) (Object, error) {
	b, e := json.Marshal(fields)
	if e != nil {
		return nil, e
	}
	var raw []byte
	e = s.Pool.QueryRow(ctx, "UPDATE resources SET data=data||$4::jsonb WHERE project_id=$1 AND kind=$2 AND id=$3 RETURNING data", p, kind, id, b).Scan(&raw)
	if errors.Is(e, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if e != nil {
		return nil, e
	}
	var out Object
	e = json.Unmarshal(raw, &out)
	return out, e
}

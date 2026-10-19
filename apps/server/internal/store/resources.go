package store

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Store) Get(ctx context.Context, p, k, id string) (Object, error) {
	var b []byte

	e := s.Pool.QueryRow(ctx, "SELECT data FROM resources WHERE project_id=$1 AND kind=$2 AND id=$3", p, k, id).Scan(&b)

	if errors.Is(e, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}

	if e != nil {
		return nil, e
	}

	var o Object

	e = json.Unmarshal(b, &o)

	return o, e
}

func (s *Store) Put(ctx context.Context, p, k, id string, o Object, create bool) error {
	b, e := json.Marshal(o)
	if e != nil {
		return e
	}

	q := "INSERT INTO resources(project_id,kind,id,data) VALUES($1,$2,$3,$4)"
	if !create {
		q += " ON CONFLICT(project_id,kind,id) DO UPDATE SET data=EXCLUDED.data"
	}

	_, e = s.Pool.Exec(ctx, q, p, k, id, b)

	return e
}

func (s *Store) Delete(ctx context.Context, p, k, id string) error {
	tag, e := s.Pool.Exec(ctx, "DELETE FROM resources WHERE project_id=$1 AND kind=$2 AND id=$3", p, k, id)
	if e == nil && tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return e
}

// Cursor is the stable (created_at,id) pair; deleting the anchor does not break pagination.
func (s *Store) List(ctx context.Context, p, k string, filter map[string]string, after string, limit int) ([]Object, string, error) {
	args := []any{p, k}
	q := "SELECT data,created_at,id FROM resources WHERE project_id=$1 AND kind=$2"
	keys := make([]string, 0, len(filter))

	for key := range filter {
		keys = append(keys, key)
	}

	sort.Strings(keys)

	for _, key := range keys {
		if filter[key] != "" {
			args = append(args, key, filter[key])
			q += fmt.Sprintf(" AND data->>$%d=$%d", len(args)-1, len(args))
		}
	}

	if after != "" {
		b, e := base64.RawURLEncoding.DecodeString(after)
		if e != nil {
			return nil, "", fmt.Errorf("invalid cursor")
		}

		var cursor struct {
			Time time.Time `json:"t"`
			ID   string    `json:"i"`
		}

		if json.Unmarshal(b, &cursor) != nil || cursor.Time.IsZero() || cursor.ID == "" {
			return nil, "", fmt.Errorf("invalid cursor")
		}

		args = append(args, cursor.Time, cursor.ID)
		q += fmt.Sprintf(" AND (created_at,id)<($%d,$%d)", len(args)-1, len(args))
	}

	args = append(args, limit+1)
	q += fmt.Sprintf(" ORDER BY created_at DESC,id DESC LIMIT $%d", len(args))

	rows, e := s.Pool.Query(ctx, q, args...)
	if e != nil {
		return nil, "", e
	}
	defer rows.Close()

	out := []Object{}
	next := ""

	for rows.Next() {
		var (
			b  []byte
			t  time.Time
			id string
		)

		if e = rows.Scan(&b, &t, &id); e != nil {
			return nil, "", e
		}

		if len(out) == limit {
			return out, next, nil
		}

		var o Object

		if e = json.Unmarshal(b, &o); e != nil {
			return nil, "", e
		}

		out = append(out, o)
		cursor, _ := json.Marshal(map[string]any{"t": t, "i": id})
		next = base64.RawURLEncoding.EncodeToString(cursor)
	}

	return out, "", rows.Err()
}

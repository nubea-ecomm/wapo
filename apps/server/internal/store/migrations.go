package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"

	"github.com/jackc/pgx/v5"
)

// Apply numbered files once under a transaction-level lock, and reject edits to applied migrations.
func (s *Store) Migrate(ctx context.Context, path string) error {
	dir := path
	if info, e := os.Stat(path); e != nil {
		return e
	} else if !info.IsDir() {
		dir = filepath.Dir(path)
	}

	files, e := filepath.Glob(filepath.Join(dir, "*.sql"))
	if e != nil {
		return e
	}

	sort.Strings(files)

	if len(files) == 0 {
		return fmt.Errorf("no SQL migrations found")
	}

	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)

	if _, e = tx.Exec(ctx, "SELECT pg_advisory_xact_lock(874163902)"); e != nil {
		return e
	}

	if _, e = tx.Exec(ctx, "CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())"); e != nil {
		return e
	}

	for _, file := range files {
		b, e := os.ReadFile(file)
		if e != nil {
			return e
		}

		name := filepath.Base(file)
		checksum := Hash(string(b))

		var old string

		e = tx.QueryRow(ctx, "SELECT checksum FROM schema_migrations WHERE version=$1", name).Scan(&old)
		if e == nil {
			if old != checksum {
				return fmt.Errorf("applied migration %s was modified", name)
			}

			continue
		}

		if !errors.Is(e, pgx.ErrNoRows) {
			return e
		}

		if _, e = tx.Exec(ctx, string(b)); e != nil {
			return fmt.Errorf("migration %s: %w", name, e)
		}

		if _, e = tx.Exec(ctx, "INSERT INTO schema_migrations(version,checksum) VALUES($1,$2)", name, checksum); e != nil {
			return e
		}
	}

	return tx.Commit(ctx)
}

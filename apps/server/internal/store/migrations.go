package store

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

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

	if e = validateMigrationFiles(files); e != nil {
		return e
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

var migrationName = regexp.MustCompile(`^(\d{3})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$`)

func validateMigrationFiles(files []string) error {
	versions := map[int][]string{}

	for _, file := range files {
		name := filepath.Base(file)
		parts := migrationName.FindStringSubmatch(name)

		if parts == nil {
			return fmt.Errorf("invalid migration name %s: expected NNN_snake_case.sql", name)
		}

		version, _ := strconv.Atoi(parts[1])
		versions[version] = append(versions[version], name)
	}

	for version, names := range versions {
		if len(names) < 2 {
			continue
		}

		sort.Strings(names)

		if version != 12 || len(names) != 2 || names[0] != "012_conversation_customers.sql" || names[1] != "012_user_profile.sql" {
			return fmt.Errorf("duplicate migration version %03d: %s", version, strings.Join(names, ", "))
		}
	}

	ordered := make([]int, 0, len(versions))
	for version := range versions {
		ordered = append(ordered, version)
	}

	sort.Ints(ordered)

	if len(ordered) == 0 || ordered[0] != 1 {
		return fmt.Errorf("migration sequence must start at 001")
	}

	for index := 1; index < len(ordered); index++ {
		if ordered[index] != ordered[index-1]+1 {
			return fmt.Errorf("migration sequence jumps from %03d to %03d", ordered[index-1], ordered[index])
		}
	}

	return nil
}

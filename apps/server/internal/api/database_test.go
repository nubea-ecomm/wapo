package api

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

// A dedicated schema prevents a running development worker from claiming test deliveries.
func TestMain(m *testing.M) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		os.Exit(m.Run())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	conn, e := pgx.Connect(ctx, dsn)

	cancel()

	if e != nil {
		fmt.Fprintln(os.Stderr, "cannot connect integration database:", e)
		os.Exit(1)
	}

	schema := store.ID("wapo_test")
	name := pgx.Identifier{schema}.Sanitize()

	if _, e = conn.Exec(context.Background(), "CREATE SCHEMA "+name); e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}

	parsed, e := url.Parse(dsn)
	if e != nil {
		fmt.Fprintln(os.Stderr, e)
		os.Exit(1)
	}

	q := parsed.Query()
	q.Set("search_path", schema)
	parsed.RawQuery = q.Encode()
	os.Setenv("TEST_DATABASE_URL", parsed.String())

	code := m.Run()

	if _, e = conn.Exec(context.Background(), "DROP SCHEMA "+name+" CASCADE"); e != nil {
		fmt.Fprintln(os.Stderr, "cannot clean test schema:", e)

		code = 1
	}

	conn.Close(context.Background())
	os.Exit(code)
}

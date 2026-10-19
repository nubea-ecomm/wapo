package store

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Object = map[string]any

var ErrNotFound = errors.New("not found")

type Store struct {
	Pool *pgxpool.Pool
	aead cipher.AEAD
}

func Open(ctx context.Context, dsn string, key []byte) (*Store, error) {
	pool, e := pgxpool.New(ctx, dsn)
	if e != nil {
		return nil, e
	}
	if e = pool.Ping(ctx); e != nil {
		pool.Close()
		return nil, e
	}
	block, e := aes.NewCipher(key)
	if e != nil {
		pool.Close()
		return nil, e
	}
	a, e := cipher.NewGCM(block)
	if e != nil {
		pool.Close()
		return nil, e
	}
	return &Store{pool, a}, nil
}
func (s *Store) Bootstrap(ctx context.Context, project, key string) error {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	var deleted bool
	if e = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM deleted_projects WHERE id=$1)", project).Scan(&deleted); e != nil {
		return e
	}
	if deleted {
		return nil
	}
	if _, e = tx.Exec(ctx, "INSERT INTO projects(id,name) VALUES($1,$1) ON CONFLICT DO NOTHING", project); e != nil {
		return e
	}
	var owner string
	e = tx.QueryRow(ctx, "INSERT INTO api_keys(hash,project_id,id,name,prefix) VALUES($1,$2,$3,'Bootstrap key',$4) ON CONFLICT(hash) DO UPDATE SET hash=EXCLUDED.hash RETURNING project_id", Hash(key), project, ID("key"), key[:min(len(key), 12)]).Scan(&owner)
	if e != nil {
		return e
	}
	if owner != project {
		return fmt.Errorf("API key already belongs to a different project")
	}
	return tx.Commit(ctx)
}
func (s *Store) Authenticate(ctx context.Context, key string) (string, error) {
	var p string
	e := s.Pool.QueryRow(ctx, "SELECT k.project_id FROM api_keys k JOIN projects p ON p.id=k.project_id WHERE k.hash=$1 AND k.revoked_at IS NULL AND p.status='active'", Hash(key)).Scan(&p)
	return p, e
}

package store

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Object = map[string]any

var ErrNotFound = errors.New("not found")

type Store struct {
	Pool       *pgxpool.Pool
	aead       cipher.AEAD
	auth       authCache
	rateLeases sync.Map
}

type Options struct {
	MaxConns, MinConns int32
	AuthCacheTTL       time.Duration
	AuthCacheEntries   int
}

type authCacheEntry struct {
	project string
	expires time.Time
}

type authCache struct {
	sync.RWMutex
	entries map[string]authCacheEntry
	ttl     time.Duration
	maximum int
}

func Open(ctx context.Context, dsn string, key []byte, options ...Options) (*Store, error) {
	poolConfig, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		return nil, e
	}

	var option Options

	if len(options) > 0 {
		option = options[0]
	}

	if option.MaxConns > 0 {
		poolConfig.MaxConns = option.MaxConns
	}

	if option.MinConns >= 0 && option.MinConns <= poolConfig.MaxConns {
		poolConfig.MinConns = option.MinConns
	}

	pool, e := pgxpool.NewWithConfig(ctx, poolConfig)
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

	return &Store{Pool: pool, aead: a, auth: authCache{entries: make(map[string]authCacheEntry), ttl: option.AuthCacheTTL, maximum: option.AuthCacheEntries}}, nil
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
	return s.AuthenticateHash(ctx, Hash(key))
}

func (s *Store) AuthenticateHash(ctx context.Context, hash string) (string, error) {
	if project, ok := s.cachedAuthentication(hash); ok {
		return project, nil
	}

	var p string

	e := s.Pool.QueryRow(ctx, "SELECT k.project_id FROM api_keys k JOIN projects p ON p.id=k.project_id WHERE k.hash=$1 AND k.revoked_at IS NULL AND p.status='active'", hash).Scan(&p)
	if e == nil {
		s.cacheAuthentication(hash, p)
	}

	return p, e
}

func (s *Store) cachedAuthentication(hash string) (string, bool) {
	if s.auth.ttl <= 0 || s.auth.maximum <= 0 {
		return "", false
	}

	s.auth.RLock()
	entry, ok := s.auth.entries[hash]
	s.auth.RUnlock()

	return entry.project, ok && time.Now().Before(entry.expires)
}

func (s *Store) cacheAuthentication(hash, project string) {
	if s.auth.ttl <= 0 || s.auth.maximum <= 0 {
		return
	}

	s.auth.Lock()
	// Clearing at the bound keeps the hot path O(1) and puts a hard ceiling on
	// memory. A cache miss only falls back to the authoritative database.
	if len(s.auth.entries) >= s.auth.maximum {
		clear(s.auth.entries)
	}

	s.auth.entries[hash] = authCacheEntry{project: project, expires: time.Now().Add(s.auth.ttl)}
	s.auth.Unlock()
}

func (s *Store) InvalidateAuthentication(hash string) {
	s.auth.Lock()
	delete(s.auth.entries, hash)
	s.auth.Unlock()
}

func (s *Store) InvalidateProjectAuthentication(project string) {
	s.auth.Lock()
	for hash, entry := range s.auth.entries {
		if entry.project == project {
			delete(s.auth.entries, hash)
		}
	}

	s.auth.Unlock()
}

package store

import (
	"context"
	"time"
)

func (s *Store) AllowRequest(ctx context.Context, scope, key string, maximum int) (bool, error) {
	window := time.Now().UTC().Truncate(time.Minute)

	var count int

	err := s.Pool.QueryRow(ctx, `INSERT INTO rate_limit_counters(scope,key_hash,window_start,count) VALUES($1,$2,$3,1) ON CONFLICT(scope,key_hash,window_start) DO UPDATE SET count=rate_limit_counters.count+1 RETURNING count`, scope, Hash(key), window).Scan(&count)

	return count <= maximum, err
}

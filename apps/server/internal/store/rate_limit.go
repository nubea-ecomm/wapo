package store

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

type rateLease struct {
	mu        sync.Mutex
	window    time.Time
	remaining int
	exhausted bool
}

func (s *Store) AllowRequest(ctx context.Context, scope, key string, maximum int) (bool, error) {
	window := time.Now().UTC().Truncate(time.Minute)
	keyHash := Hash(key)
	value, _ := s.rateLeases.LoadOrStore(scope+"\x00"+keyHash, &rateLease{})
	lease := value.(*rateLease)
	lease.mu.Lock()
	defer lease.mu.Unlock()

	if lease.window != window {
		lease.window, lease.remaining, lease.exhausted = window, 0, false
	}

	if lease.remaining > 0 {
		lease.remaining--
		return true, nil
	}

	if lease.exhausted {
		return false, nil
	}

	block := max(1, min(1000, maximum/1000))

	var reserved int

	err := s.Pool.QueryRow(ctx, `
		INSERT INTO rate_limit_counters(scope,key_hash,window_start,count)
		VALUES($1,$2,$3,$4)
		ON CONFLICT(scope,key_hash,window_start) DO UPDATE
		SET count=rate_limit_counters.count+$4
		WHERE rate_limit_counters.count+$4 <= $5
		RETURNING $4`, scope, keyHash, window, block, maximum).Scan(&reserved)

	if errors.Is(err, pgx.ErrNoRows) {
		// A full block may not fit at the end of an uneven quota. Reserving one
		// final token preserves the exact configured limit.
		err = s.Pool.QueryRow(ctx, `
			UPDATE rate_limit_counters SET count=count+1
			WHERE scope=$1 AND key_hash=$2 AND window_start=$3 AND count < $4
			RETURNING 1`, scope, keyHash, window, maximum).Scan(&reserved)
	}

	if errors.Is(err, pgx.ErrNoRows) {
		lease.exhausted = true
		return false, nil
	}

	if err != nil {
		return false, err
	}

	// Tokens are reserved in PostgreSQL before use. This keeps the shared quota
	// safe across replicas while reducing hot-row writes by up to 1000x.
	lease.remaining = reserved - 1

	return true, nil
}

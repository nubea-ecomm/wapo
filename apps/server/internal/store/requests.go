package store

import (
	"context"
)

// Reserve persists before contacting a provider. An unresolved send is never automatically resent.
func (s *Store) Reserve(ctx context.Context, p, key, fingerprint string) (bool, int, []byte, error) {
	tag, e := s.Pool.Exec(ctx, "INSERT INTO requests(project_id,key,fingerprint,state) VALUES($1,$2,$3,'pending') ON CONFLICT DO NOTHING", p, key, fingerprint)
	if e != nil {
		return false, 0, nil, e
	}
	if tag.RowsAffected() == 1 {
		return true, 0, nil, nil
	}
	var f, state string
	var status *int
	var response []byte
	e = s.Pool.QueryRow(ctx, "SELECT fingerprint,state,status,response FROM requests WHERE project_id=$1 AND key=$2", p, key).Scan(&f, &state, &status, &response)
	if e != nil {
		return false, 0, nil, e
	}
	if f != fingerprint {
		return false, 409, []byte(`{"error":{"code":"idempotency_conflict","message":"Key already used for a different request"}}`), nil
	}
	if state == "pending" {
		return false, 409, []byte(`{"error":{"code":"send_unresolved","message":"Send is in progress or has an uncertain result; reconcile before retrying"}}`), nil
	}
	return false, *status, response, nil
}
func (s *Store) Complete(ctx context.Context, p, key string, status int, b []byte) error {
	_, e := s.Pool.Exec(ctx, "UPDATE requests SET state='complete',status=$3,response=$4 WHERE project_id=$1 AND key=$2", p, key, status, b)
	return e
}

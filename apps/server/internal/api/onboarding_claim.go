package api

import (
	"context"
	"encoding/json"
	"time"
	"wapo.local/server/internal/store"
)

func (s *Server) claimSetupCompletion(ctx context.Context, project, id string) (store.Object, error) {
	var raw []byte
	err := s.Store.Pool.QueryRow(ctx, `UPDATE resources SET data=data||jsonb_build_object('status','processing','completion_started_at',$3::text) WHERE project_id=$1 AND kind='setup_links' AND id=$2 AND data->>'status'='active' RETURNING data`, project, id, time.Now().UTC().Format(time.RFC3339Nano)).Scan(&raw)
	if err != nil {
		return nil, err
	}
	var current store.Object
	if err = json.Unmarshal(raw, &current); err != nil {
		return nil, err
	}
	return current, nil
}

func (s *Server) releaseSetupCompletion(project, id string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, _ = s.Store.Pool.Exec(ctx, `UPDATE resources SET data=(data-'completion_started_at')||'{"status":"active"}'::jsonb WHERE project_id=$1 AND kind='setup_links' AND id=$2 AND data->>'status'='processing'`, project, id)
}

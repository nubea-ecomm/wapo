package api

import (
	"context"
	"strings"

	"wapo.local/server/internal/store"
)

func (s *Server) metaCallbackURL() string {
	return strings.TrimRight(s.Config.PublicURL, "/") + "/hooks/meta"
}

func (s *Server) recordGlobalMetaVerification(ctx context.Context) error {
	_, err := s.Store.Pool.Exec(ctx, `INSERT INTO meta_webhook_verifications(app_id,callback_url,token_hash)
	 VALUES($1,$2,$3) ON CONFLICT(app_id,callback_url) DO UPDATE SET token_hash=EXCLUDED.token_hash,verified_at=now()`, s.Config.MetaAppID, s.metaCallbackURL(), store.Hash(s.Config.MetaVerifyToken))

	return err
}

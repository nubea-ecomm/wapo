package api

import (
	"context"
	"log/slog"
	"time"

	"wapo.local/server/internal/store"
)

const dueConnectionHealthQuery = `SELECT c.project_id,c.data FROM resources c LEFT JOIN resources h ON h.project_id=c.project_id AND h.kind='connection_health' AND h.id=c.id WHERE c.kind='connections' AND c.data->>'channel'='whatsapp' AND c.data->>'status'='connected' AND (h.id IS NULL OR NULLIF(h.data->>'checked_at','')::timestamptz<now()-interval '10 minutes') ORDER BY NULLIF(h.data->>'checked_at','')::timestamptz NULLS FIRST LIMIT 5`

func (s *Server) RunConnectionHealth(ctx context.Context) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			rows, e := s.Store.Pool.Query(ctx, dueConnectionHealthQuery)
			if e != nil {
				slog.Error("connection health discovery failed", "error", e)
				continue
			}

			type account struct {
				p string
				c store.Object
			}

			items := []account{}

			for rows.Next() {
				var (
					p string
					c store.Object
				)

				if e = rows.Scan(&p, &c); e != nil {
					break
				}

				items = append(items, account{p, c})
			}

			rows.Close()

			if e == nil {
				e = rows.Err()
			}

			if e != nil {
				slog.Error("connection health scan failed", "error", e)
				continue
			}

			for _, item := range items {
				if ctx.Err() != nil {
					return
				}

				if _, e = s.checkConnection(ctx, item.p, item.c); e != nil && ctx.Err() == nil {
					slog.Warn("connection health check failed", "project", item.p, "connection", str(item.c, "id"), "error", e)
				}
			}
		}
	}
}

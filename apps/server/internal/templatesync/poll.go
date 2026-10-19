package templatesync

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"log/slog"
	"net/url"
	"time"
	"wapo.local/server/internal/channel"
	"wapo.local/server/internal/store"
)

func Run(ctx context.Context, s *store.Store, meta channel.WhatsApp) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := Once(ctx, s, meta); err != nil && !errors.Is(err, pgx.ErrNoRows) && ctx.Err() == nil {
				slog.Error("template synchronization failed", "error", err)
			}
		}
	}
}
func Once(ctx context.Context, s *store.Store, meta channel.WhatsApp) error {
	// Discover accounts even if templates were created outside this console.
	_, e := s.Pool.Exec(ctx, `INSERT INTO template_sync_accounts(project_id,business_account_id) SELECT DISTINCT project_id,data->>'business_account_id' FROM resources WHERE kind='connections' AND data->>'channel'='whatsapp' AND data->>'status'='connected' AND coalesce(data->>'access_token','')<>'' AND coalesce(data->>'business_account_id','')<>'' ON CONFLICT DO NOTHING`)
	if e != nil {
		return e
	}
	if _, e = s.Pool.Exec(ctx, "DELETE FROM template_sync_accounts a WHERE NOT EXISTS(SELECT 1 FROM resources c WHERE c.project_id=a.project_id AND c.kind='connections' AND c.data->>'business_account_id'=a.business_account_id AND c.data->>'channel'='whatsapp' AND c.data->>'status'='connected')"); e != nil {
		return e
	}
	var p, waba string
	e = s.Pool.QueryRow(ctx, `UPDATE template_sync_accounts SET lease_until=now()+interval '2 minutes' WHERE (project_id,business_account_id)=(SELECT project_id,business_account_id FROM template_sync_accounts WHERE next_sync_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_sync_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING project_id,business_account_id`).Scan(&p, &waba)
	if e != nil {
		return e
	}
	runCtx, cancel := context.WithTimeout(ctx, 75*time.Second)
	defer cancel()
	err := Sync(runCtx, s, meta, p, waba)
	finishCtx, finishCancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer finishCancel()
	if err != nil {
		_, e = s.Pool.Exec(finishCtx, `UPDATE template_sync_accounts SET lease_until=NULL,failures=failures+1,last_error='Meta template synchronization failed',next_sync_at=now()+make_interval(secs=>least(3600,60*power(2,least(failures,6)))::int) WHERE project_id=$1 AND business_account_id=$2`, p, waba)
		return e
	}
	_, e = s.Pool.Exec(finishCtx, `UPDATE template_sync_accounts SET lease_until=NULL,failures=0,last_error=NULL,last_success_at=now(),next_sync_at=now()+CASE WHEN EXISTS(SELECT 1 FROM template_states WHERE project_id=$1 AND business_account_id=$2 AND data->>'status' IN ('PENDING','IN_APPEAL','PENDING_DELETION')) THEN interval '1 minute' ELSE interval '6 hours' END WHERE project_id=$1 AND business_account_id=$2`, p, waba)
	return e
}
func Sync(ctx context.Context, s *store.Store, meta channel.WhatsApp, p, waba string) error {
	rows, _, e := s.List(ctx, p, "connections", map[string]string{"channel": "whatsapp", "business_account_id": waba, "status": "connected"}, "", 1)
	if e != nil {
		return e
	}
	if len(rows) == 0 {
		return fmt.Errorf("no connected account")
	}
	c := rows[0]
	token, e := s.Unseal(Text(c, "access_token"), p)
	if e != nil {
		return e
	}
	started := time.Now()
	after := ""
	for page := 0; page < 100; page++ {
		q := url.Values{"limit": {"100"}, "fields": {"id,name,language,status,category,quality_score,rejected_reason"}}
		if after != "" {
			q.Set("after", after)
		}
		status, raw, e := meta.Call(ctx, "GET", meta.Version+"/"+url.PathEscape(waba)+"/message_templates", token, nil, q.Encode())
		if e != nil {
			return e
		}
		if status != 200 {
			return fmt.Errorf("Meta returned %d", status)
		}
		var body struct {
			Data   []store.Object `json:"data"`
			Paging struct {
				Next    string `json:"next"`
				Cursors struct {
					After string `json:"after"`
				} `json:"cursors"`
			} `json:"paging"`
		}
		if e = json.Unmarshal(raw, &body); e != nil {
			return e
		}
		for _, item := range body.Data {
			if e = Observe(ctx, s, p, waba, Text(c, "id"), item, "poll", started, 0); e != nil {
				return e
			}
		}
		next := body.Paging.Cursors.After
		if body.Paging.Next == "" || next == "" {
			return nil
		}
		if next == after {
			return fmt.Errorf("repeated Meta cursor")
		}
		after = next
	}
	return fmt.Errorf("Meta pagination limit reached")
}

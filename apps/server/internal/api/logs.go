package api

import (
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"
	"wapo.local/server/internal/store"
)

//go:embed queries/logs.sql
var logsSQL string

type logCursor struct {
	At time.Time `json:"at"`
	ID string    `json:"id"`
}

func (s *Server) logs(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != "GET" {
		fail(w, 405, "method_not_allowed", "Use GET")
		return
	}
	if id != "" {
		s.logDetail(w, r, id)
		return
	}
	q := r.URL.Query()
	source := q.Get("source")
	if source != "" && source != "api" && source != "meta" && source != "messages" && source != "webhooks" && source != "events" {
		fail(w, 422, "validation_error", "Invalid log source")
		return
	}
	ranges := map[string]time.Duration{"1h": time.Hour, "24h": 24 * time.Hour, "7d": 7 * 24 * time.Hour, "30d": 30 * 24 * time.Hour}
	period := q.Get("range")
	if period == "" {
		period = "24h"
	}
	duration, ok := ranges[period]
	if !ok {
		fail(w, 422, "validation_error", "range must be 1h, 24h, 7d or 30d")
		return
	}
	if len(q.Get("search")) > 200 || (q.Get("errors_only") != "" && q.Get("errors_only") != "true" && q.Get("errors_only") != "false") {
		fail(w, 422, "validation_error", "Invalid log filter")
		return
	}
	var at *time.Time
	cursor := logCursor{}
	if after := q.Get("after"); after != "" {
		raw, e := base64.RawURLEncoding.DecodeString(after)
		if len(after) > 512 || e != nil || json.Unmarshal(raw, &cursor) != nil || cursor.At.IsZero() || cursor.ID == "" || len(cursor.ID) > 150 {
			fail(w, 400, "invalid_cursor", "Invalid log cursor")
			return
		}
		at = &cursor.At
	}
	rows, e := s.Store.Pool.Query(r.Context(), logsSQL, project(r), time.Now().UTC().Add(-duration), source, q.Get("errors_only") == "true", strings.TrimSpace(q.Get("search")), at, cursor.ID)
	if e != nil {
		dbError(w, e)
		return
	}
	defer rows.Close()
	out := []store.Object{}
	next := ""
	for rows.Next() {
		var id, source, summary, details, status, requestID string
		var httpStatus *int
		var elapsed *float64
		var created time.Time
		var failed bool
		var raw []byte
		if e = rows.Scan(&id, &source, &summary, &details, &status, &httpStatus, &elapsed, &requestID, &created, &failed, &raw); e != nil {
			dbError(w, e)
			return
		}
		if len(out) == 100 {
			last := out[99]
			b, _ := json.Marshal(logCursor{At: timeMustParse(str(last, "created_at")), ID: str(last, "id")})
			next = base64.RawURLEncoding.EncodeToString(b)
			break
		}
		var metadata store.Object
		if e = json.Unmarshal(raw, &metadata); e != nil {
			dbError(w, e)
			return
		}
		out = append(out, store.Object{"id": id, "source": source, "summary": summary, "details": details, "status": status, "http_status": httpStatus, "duration_ms": elapsed, "request_id": requestID, "created_at": created.UTC().Format(time.RFC3339Nano), "is_error": failed, "metadata": metadata})
	}
	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}
	write(w, 200, store.Object{"data": out, "meta": store.Object{"has_more": next != "", "after": next}})
}
func timeMustParse(value string) time.Time { at, _ := time.Parse(time.RFC3339Nano, value); return at }

package api

import (
	"net/http"
	"strconv"
	"time"
	"wapo.local/server/internal/store"
)

func (s *Server) customerMetrics(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != "GET" {
		fail(w, 405, "method_not_allowed", "Use GET")
		return
	}
	if _, e := s.Store.Get(r.Context(), project(r), "customers", id); e != nil {
		dbError(w, e)
		return
	}
	days := 30
	if raw := r.URL.Query().Get("days"); raw != "" {
		n, e := strconv.Atoi(raw)
		if e != nil || (n != 7 && n != 30 && n != 90) {
			fail(w, 422, "invalid_period", "days must be 7, 30 or 90")
			return
		}
		days = n
	}
	now := time.Now().UTC()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -days+1)
	p := project(r)
	ctx := r.Context()
	types := store.Object{"dedicated": 0, "coexistence": 0, "unknown": 0}
	var total, connected int
	rows, e := s.Store.Pool.Query(ctx, `SELECT coalesce(data->>'connection_type','unknown'),count(*),count(*) FILTER(WHERE data->>'status'='connected') FROM resources WHERE project_id=$1 AND kind='connections' AND data->>'customer_id'=$2 AND data->>'channel'='whatsapp' GROUP BY 1`, p, id)
	if e != nil {
		dbError(w, e)
		return
	}
	for rows.Next() {
		var kind string
		var n, active int
		if e = rows.Scan(&kind, &n, &active); e != nil {
			rows.Close()
			dbError(w, e)
			return
		}
		total += n
		connected += active
		if kind != "dedicated" && kind != "coexistence" {
			kind = "unknown"
		}
		types[kind] = types[kind].(int) + n
	}
	rows.Close()
	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}
	rows, e = s.Store.Pool.Query(ctx, `SELECT to_char(m.created_at AT TIME ZONE 'UTC','YYYY-MM-DD'),count(*) FILTER(WHERE m.data->>'direction'='outbound'),count(*) FILTER(WHERE m.data->>'direction'='inbound'),count(*) FILTER(WHERE m.data->>'direction'='outbound' AND m.data->>'status' IN ('sent','delivered','read')),count(*) FILTER(WHERE m.data->>'direction'='outbound' AND m.data->>'status' IN ('delivered','read')),count(*) FILTER(WHERE m.data->>'direction'='outbound' AND m.data->>'status'='read'),count(*) FILTER(WHERE m.data->>'direction'='outbound' AND m.data->>'status'='failed') FROM resources m JOIN resources c ON c.project_id=m.project_id AND c.kind='connections' AND c.id=m.data->>'connection_id' WHERE m.project_id=$1 AND m.kind='messages' AND c.data->>'customer_id'=$2 AND c.data->>'channel'='whatsapp' AND m.created_at >= $3 AND m.created_at <= $4 GROUP BY 1`, p, id, start, now)
	if e != nil {
		dbError(w, e)
		return
	}
	totals := [6]int{}
	daily := map[string][6]int{}
	for rows.Next() {
		var day string
		var n [6]int
		if e = rows.Scan(&day, &n[0], &n[1], &n[2], &n[3], &n[4], &n[5]); e != nil {
			rows.Close()
			dbError(w, e)
			return
		}
		daily[day] = n
		for i := range n {
			totals[i] += n[i]
		}
	}
	rows.Close()
	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}
	series := []store.Object{}
	for i := 0; i < days; i++ {
		day := start.AddDate(0, 0, i).Format("2006-01-02")
		n := daily[day]
		series = append(series, store.Object{"day": day, "outbound": n[0], "inbound": n[1], "failed": n[5]})
	}
	var conversations, open int
	e = s.Store.Pool.QueryRow(ctx, `SELECT count(*),count(*) FILTER(WHERE m.data->>'status'='open') FROM resources m JOIN resources c ON c.project_id=m.project_id AND c.kind='connections' AND c.id=m.data->>'connection_id' WHERE m.project_id=$1 AND m.kind='conversations' AND c.data->>'customer_id'=$2 AND c.data->>'channel'='whatsapp'`, p, id).Scan(&conversations, &open)
	if e != nil {
		dbError(w, e)
		return
	}
	write(w, 200, store.Object{"data": store.Object{"days": days, "timezone": "UTC", "from": start.Format(time.RFC3339), "to": now.Format(time.RFC3339), "outbound": totals[0], "received": totals[1], "sent": totals[2], "delivered": totals[3], "read": totals[4], "failed": totals[5], "pending": totals[0] - totals[2] - totals[5], "connections": total, "connected": connected, "connection_types": types, "conversations": conversations, "open_conversations": open, "series": series}})
}

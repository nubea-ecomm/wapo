package api

import (
	"net/http"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) overview(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		fail(w, 405, "method_not_allowed", "Use GET")
		return
	}

	p := project(r)
	ctx := r.Context()
	out := store.Object{}

	for _, kind := range []string{"customers", "connections", "conversations"} {
		var n int

		if kind == "customers" {
			e := s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM customers WHERE project_id=$1", p).Scan(&n)
			if e != nil {
				dbError(w, e)
				return
			}
		} else if e := s.Store.Pool.QueryRow(ctx, "SELECT count(*) FROM resources WHERE project_id=$1 AND kind=$2 AND ($3='' OR data->>'channel'=$3)", p, kind, s.Config.ChannelFilter()).Scan(&n); e != nil {
			dbError(w, e)
			return
		}

		out[kind] = n
	}

	var sent, received, delivered, read, failed int

	e := s.Store.Pool.QueryRow(ctx, `SELECT count(*) FILTER(WHERE data->>'direction'='outbound'),count(*) FILTER(WHERE data->>'direction'='inbound'),count(*) FILTER(WHERE data->>'direction'='outbound' AND data->>'status' IN ('delivered','read','played')),count(*) FILTER(WHERE data->>'direction'='outbound' AND data->>'status' IN ('read','played')),count(*) FILTER(WHERE data->>'direction'='outbound' AND data->>'status'='failed') FROM resources WHERE project_id=$1 AND kind='messages' AND ($2='' OR data->>'channel'=$2) AND created_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'-interval '29 days'`, p, s.Config.ChannelFilter()).Scan(&sent, &received, &delivered, &read, &failed)
	if e != nil {
		dbError(w, e)
		return
	}

	out["sent"] = sent
	out["received"] = received
	out["delivered"] = delivered
	out["read"] = read
	out["failed"] = failed

	rows, e := s.Store.Pool.Query(ctx, `SELECT to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD'),count(*) FILTER(WHERE data->>'direction'='outbound'),count(*) FILTER(WHERE data->>'direction'='inbound') FROM resources WHERE project_id=$1 AND kind='messages' AND ($2='' OR data->>'channel'=$2) AND created_at>=now()-interval '30 days' GROUP BY 1`, p, s.Config.ChannelFilter())
	if e != nil {
		dbError(w, e)
		return
	}
	defer rows.Close()

	counts := map[string][2]int{}

	for rows.Next() {
		var (
			day  string
			a, b int
		)

		if e = rows.Scan(&day, &a, &b); e != nil {
			dbError(w, e)
			return
		}

		counts[day] = [2]int{a, b}
	}

	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}

	series := []store.Object{}

	for i := 29; i >= 0; i-- {
		day := time.Now().UTC().AddDate(0, 0, -i).Format("2006-01-02")
		n := counts[day]
		series = append(series, store.Object{"day": day, "outbound": n[0], "inbound": n[1]})
	}

	out["series"] = series
	write(w, 200, store.Object{"data": out})
}

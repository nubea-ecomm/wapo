package api

import (
	"net/http"
	"strconv"

	"wapo.local/server/internal/store"
)

func (s *Server) list(w http.ResponseWriter, r *http.Request, kind string, filters map[string]string) {
	limit := 50
	v := r.URL.Query().Get("limit")

	if v == "" {
		v = r.URL.Query().Get("per_page")
	}

	if v != "" {
		n, e := strconv.Atoi(v)
		if e != nil || n < 1 || n > 100 {
			fail(w, 400, "invalid_limit", "limit must be between 1 and 100")
			return
		}

		limit = n
	}

	after := r.URL.Query().Get("after")
	if after != "" { /* Store validates cursor before SQL. */
	}

	rows, next, e := s.Store.List(r.Context(), project(r), kind, filters, after, limit)
	if e != nil {
		if e.Error() == "invalid cursor" {
			fail(w, 400, "invalid_cursor", e.Error())
		} else {
			dbError(w, e)
		}

		return
	}

	for i, o := range rows {
		rows[i] = clean(o)
	}

	write(w, 200, store.Object{"data": rows, "meta": store.Object{"has_more": next != "", "after": next}, "paging": store.Object{"cursors": store.Object{"after": next}}})
}

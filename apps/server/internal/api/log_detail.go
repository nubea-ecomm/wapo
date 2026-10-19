package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"wapo.local/server/internal/store"
)

func (s *Server) logDetail(w http.ResponseWriter, r *http.Request, id string) {
	source, key, ok := strings.Cut(id, ":")
	if !ok {
		fail(w, 404, "not_found", "Log not found")
		return
	}

	var (
		raw []byte
		e   error
	)

	switch source {
	case "api":
		e = s.Store.Pool.QueryRow(r.Context(), `SELECT jsonb_build_object('request_id',request_id,'method',method,'path',path,'http_status',status,'duration_ms',duration_ms,'created_at',created_at) FROM request_logs WHERE project_id=$1 AND id=$2`, project(r), key).Scan(&raw)
	case "event":
		e = s.Store.Pool.QueryRow(r.Context(), `SELECT jsonb_build_object('event',name,'event_id',id,'created_at',created_at,'payload',payload) FROM events WHERE project_id=$1 AND id=$2`, project(r), key).Scan(&raw)
	case "delivery":
		e = s.Store.Pool.QueryRow(r.Context(), `SELECT jsonb_build_object('delivery_id',d.id,'event_id',d.event_id,'subscription_id',d.subscription_id,'attempts',d.attempts,'http_status',d.last_status,'status',d.state,'updated_at',d.updated_at,'event',e.name) FROM deliveries d JOIN events e ON e.id=d.event_id AND e.project_id=d.project_id WHERE d.project_id=$1 AND d.id=$2`, project(r), key).Scan(&raw)
	default:
		fail(w, 404, "not_found", "Log not found")
		return
	}

	if e != nil {
		dbError(w, notFound(e))
		return
	}

	var payload any

	if e = json.Unmarshal(raw, &payload); e != nil {
		dbError(w, e)
		return
	}

	write(w, 200, store.Object{"data": scrubLog(payload)})
}

func scrubLog(value any) any {
	switch v := value.(type) {
	case map[string]any:
		out := map[string]any{}

		for key, item := range v {
			normalized := strings.ToLower(strings.ReplaceAll(strings.ReplaceAll(key, "_", ""), "-", ""))
			if strings.Contains(normalized, "token") || strings.Contains(normalized, "secret") || strings.Contains(normalized, "password") || normalized == "authorization" || normalized == "apikey" {
				out[key] = "[redacted]"
			} else {
				out[key] = scrubLog(item)
			}
		}

		return out
	case []any:
		out := make([]any, len(v))
		for i, item := range v {
			out[i] = scrubLog(item)
		}

		return out
	default:
		return value
	}
}

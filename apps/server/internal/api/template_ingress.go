package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"

	"wapo.local/server/internal/store"
	"wapo.local/server/internal/templatesync"
)

func (s *Server) receiveTemplateChanges(r *http.Request, p string, raw []byte) error {
	var body struct {
		Entry []struct {
			ID      string `json:"id"`
			Time    int64  `json:"time"`
			Changes []struct {
				Field string       `json:"field"`
				Value store.Object `json:"value"`
			} `json:"changes"`
		} `json:"entry"`
	}

	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()

	if e := decoder.Decode(&body); e != nil {
		return e
	}

	for _, entry := range body.Entry {
		for _, change := range entry.Changes {
			if !methodIn(change.Field, "message_template_status_update template_category_update message_template_quality_update") {
				continue
			}

			// Account-level events do not carry phone metadata. Resolve the WABA inside this project.
			if _, e := s.wabaForProject(r, p, entry.ID); e == store.ErrNotFound {
				continue
			} else if e != nil {
				return e
			}

			value := change.Value
			id := templatesync.Text(value, "message_template_id")

			if id == "" {
				continue
			}

			snapshot := store.Object{"id": id}

			for from, to := range map[string]string{"message_template_name": "name", "message_template_language": "language"} {
				if v := value[from]; v != nil {
					snapshot[to] = v
				}
			}

			switch change.Field {
			case "message_template_status_update":
				if state := templatesync.Text(value, "event"); state != "" {
					snapshot["status"] = state
				}

				if reason := templatesync.Text(value, "reason"); reason != "" {
					if reason == "NONE" {
						snapshot["rejected_reason"] = nil
					} else {
						snapshot["rejected_reason"] = reason
					}
				}
			case "template_category_update":
				if category := templatesync.Text(value, "new_category"); category != "" {
					snapshot["category"] = category
					snapshot["scheduled_category"] = nil
				} else {
					if category := templatesync.Text(value, "current_category"); category != "" {
						snapshot["category"] = category
					}

					if future := templatesync.Text(value, "correct_category"); future != "" {
						snapshot["scheduled_category"] = future
						snapshot["category_update_at"] = value["category_update_timestamp"]
					}
				}
			case "message_template_quality_update":
				if quality := value["new_quality_score"]; quality != nil {
					snapshot["quality_score"] = store.Object{"score": quality}
				}
			}

			if e := templatesync.Observe(r.Context(), s.Store, p, entry.ID, "", snapshot, "webhook", time.Now(), entry.Time); e != nil {
				return e
			}

			if _, e := s.Store.Pool.Exec(r.Context(), "UPDATE template_sync_accounts SET next_sync_at=now() WHERE project_id=$1 AND business_account_id=$2", p, entry.ID); e != nil {
				return e
			}
		}
	}

	return nil
}

func (s *Server) wabaForProject(r *http.Request, p, id string) (store.Object, error) {
	rows, _, e := s.Store.List(r.Context(), p, "connections", map[string]string{"channel": "whatsapp", "business_account_id": id}, "", 1)
	if e != nil {
		return nil, e
	}

	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}

	return rows[0], nil
}

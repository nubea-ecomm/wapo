package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5"
)

var (
	errMetaOwnership = errors.New("conflicting Meta account and phone ownership")
	errMetaEnvelope  = errors.New("invalid Meta webhook envelope")
)

type metaRoutedChange struct {
	Field string          `json:"field"`
	Value json.RawMessage `json:"value"`
}
type metaRoutedEntry struct {
	ID      string             `json:"id,omitempty"`
	Time    json.RawMessage    `json:"time,omitempty"`
	Changes []metaRoutedChange `json:"changes"`
}
type metaRoutedEnvelope struct {
	Object string            `json:"object,omitempty"`
	Entry  []metaRoutedEntry `json:"entry"`
}
type metaPhoneOwner struct{ project, account string }

// Only called after validating the signature of the original, unsplit bytes.
// Resolve the entire batch before writes, then reuse the tenant-scoped handlers.
func (s *Server) routeMetaWebhook(r *http.Request, raw []byte) error {
	var envelope metaRoutedEnvelope

	if json.Unmarshal(raw, &envelope) != nil || envelope.Entry == nil || (envelope.Object != "" && envelope.Object != "whatsapp_business_account") {
		return errMetaEnvelope
	}

	accounts := map[string]string{}
	phones := map[string]metaPhoneOwner{}
	grouped := map[string][]metaRoutedEntry{}
	order := []string{}
	ignored := 0

	for _, entry := range envelope.Entry {
		owner := ""

		if entry.ID != "" {
			var known bool

			owner, known = accounts[entry.ID]

			if !known {
				err := s.Store.Pool.QueryRow(r.Context(), "SELECT project_id FROM whatsapp_accounts WHERE id=$1", entry.ID).Scan(&owner)
				if err != nil && !errors.Is(err, pgx.ErrNoRows) {
					return err
				}

				accounts[entry.ID] = owner
			}
		}

		for _, change := range entry.Changes {
			var value struct {
				Metadata struct {
					Phone string `json:"phone_number_id"`
				} `json:"metadata"`
			}

			if json.Unmarshal(change.Value, &value) != nil {
				return errMetaEnvelope
			}

			project := owner
			account := entry.ID

			if phone := value.Metadata.Phone; phone != "" {
				binding, known := phones[phone]
				if !known {
					err := s.Store.Pool.QueryRow(r.Context(), `SELECT project_id,coalesce(data->>'business_account_id','') FROM resources WHERE kind='connections' AND data->>'channel'='whatsapp' AND data->>'external_id'=$1`, phone).Scan(&binding.project, &binding.account)
					if err != nil && !errors.Is(err, pgx.ErrNoRows) {
						return err
					}

					phones[phone] = binding
				}

				if binding.project != "" {
					if (entry.ID != "" && binding.account != entry.ID) || (owner != "" && owner != binding.project) {
						return errMetaOwnership
					}

					project = binding.project
					if account == "" {
						account = binding.account
					}
				}
			}

			if project == "" {
				ignored++
				continue
			}

			if _, exists := grouped[project]; !exists {
				order = append(order, project)
			}

			grouped[project] = append(grouped[project], metaRoutedEntry{ID: account, Time: entry.Time, Changes: []metaRoutedChange{change}})
		}
	}

	if ignored > 0 {
		slog.Warn("Meta webhook changes reference unowned assets", "ignored_changes", ignored)
	}

	for _, project := range order {
		payload, err := json.Marshal(metaRoutedEnvelope{Object: envelope.Object, Entry: grouped[project]})
		if err != nil {
			return err
		}

		if err = s.processMetaWebhook(r, project, payload); err != nil {
			return err
		}
	}

	return nil
}

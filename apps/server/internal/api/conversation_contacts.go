package api

import (
	"context"

	"wapo.local/server/internal/store"
)

func (s *Server) enrichConversationContacts(ctx context.Context, projectID string, conversations []store.Object) error {
	ids := make([]string, 0, len(conversations))
	for _, conversation := range conversations {
		if id := str(conversation, "id"); id != "" {
			ids = append(ids, id)
		}
	}

	if len(ids) == 0 {
		return nil
	}

	rows, err := s.Store.Pool.Query(ctx, "SELECT id,display_name,profile_name,username FROM contacts WHERE project_id=$1 AND id=ANY($2)", projectID, ids)
	if err != nil {
		return err
	}
	defer rows.Close()

	type identity struct{ display, profile, username string }

	contacts := map[string]identity{}

	for rows.Next() {
		var (
			id      string
			contact identity
		)

		if err = rows.Scan(&id, &contact.display, &contact.profile, &contact.username); err != nil {
			return err
		}

		contacts[id] = contact
	}

	if err = rows.Err(); err != nil {
		return err
	}

	for _, conversation := range conversations {
		contact, ok := contacts[str(conversation, "id")]
		if !ok {
			continue
		}

		conversation["contact_name"] = contact.display
		conversation["contact_profile_name"] = contact.profile
		conversation["contact_username"] = contact.username
	}

	return nil
}

package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// ConfirmedWhatsAppIdentity only accepts a mapping explicitly returned by Meta
// for the submitted recipient. Country-specific digit substitutions are unsafe.
func ConfirmedWhatsAppIdentity(response Object, input string) string {
	contacts, _ := response["contacts"].([]any)
	for _, value := range contacts {
		contact, _ := value.(map[string]any)
		if contact["input"] == input {
			if identity, ok := contact["wa_id"].(string); ok && identity != "" {
				return identity
			}
		}
	}

	return input
}

// WhatsAppRecipient reuses an accepted input only when a stored Meta response
// identifies it as the requested WhatsApp account, within this connection.
// Reading original responses also supports sends made before alias resolution.
func (s *Store) WhatsAppRecipient(ctx context.Context, project, connection, recipient string) (string, string, error) {
	var input, identity string

	err := s.Pool.QueryRow(ctx, `SELECT m.data->'payload'->>'to',evidence.identity
		FROM resources m CROSS JOIN LATERAL (
			SELECT contact->>'wa_id' AS identity FROM jsonb_array_elements(
			CASE WHEN jsonb_typeof(m.data->'provider_response'->'contacts')='array'
			THEN m.data->'provider_response'->'contacts' ELSE '[]'::jsonb END) contact
			WHERE contact->>'input'=m.data->'payload'->>'to'
			UNION
			SELECT status->>'recipient_id' FROM jsonb_array_elements(
			CASE WHEN jsonb_typeof(m.data->'statuses')='array' THEN m.data->'statuses' ELSE '[]'::jsonb END) status
			WHERE status->>'status' IN ('delivered','read')
		) evidence
		WHERE m.project_id=$1 AND m.kind='messages' AND m.data->>'connection_id'=$2
		AND m.data->>'direction'='outbound' AND m.data->>'channel'='whatsapp'
		AND m.data->>'status' IN ('sent','delivered','read')
		AND coalesce(m.data->'payload'->>'to','')<>'' AND coalesce(evidence.identity,'')<>''
		AND (evidence.identity=$3 OR m.data->'payload'->>'to'=$3)
		ORDER BY (evidence.identity<>m.data->'payload'->>'to') DESC,m.created_at DESC,m.id DESC,evidence.identity LIMIT 1`, project, connection, recipient).Scan(&input, &identity)

	if errors.Is(err, pgx.ErrNoRows) {
		return recipient, recipient, nil
	}

	return input, identity, err
}

package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

type MarketingPreference struct {
	Status      string
	Detail      string
	Source      string
	LastEventAt time.Time
	Sequence    int64
}

func EnsureContactTx(ctx context.Context, tx pgx.Tx, project, connection, customer, waID, profileName string) (string, error) {
	id := ConversationID(connection, waID)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	displayName := profileName

	if displayName == "" {
		displayName = waID
	}

	contact := Object{"id": id, "connection_id": connection, "customer_id": customer, "wa_id": waID, "phone_number": waID, "profile_name": profileName, "display_name": displayName, "display_name_custom": false, "properties": Object{}, "updated_at": now}

	raw, err := json.Marshal(contact)
	if err != nil {
		return "", err
	}

	_, err = tx.Exec(ctx, `INSERT INTO resources(project_id,kind,id,data) VALUES($1,'contacts',$2,$3)
		ON CONFLICT(project_id,kind,id) DO UPDATE SET data=resources.data
		||jsonb_build_object('profile_name',CASE WHEN coalesce(EXCLUDED.data->>'profile_name','')='' THEN resources.data->'profile_name' ELSE EXCLUDED.data->'profile_name' END,'updated_at',EXCLUDED.data->'updated_at')
		||CASE WHEN coalesce(resources.data->>'display_name','')='' THEN jsonb_build_object('display_name',EXCLUDED.data->'display_name') ELSE '{}'::jsonb END`, project, id, raw)

	return id, err
}

func (s *Store) MarketingAllowed(ctx context.Context, project, connection, waID string) (bool, error) {
	var stopped bool

	err := s.Pool.QueryRow(ctx, `SELECT EXISTS(
		SELECT 1 FROM contacts contact JOIN contact_marketing_preferences preference
		ON preference.project_id=contact.project_id AND preference.contact_id=contact.id
		WHERE contact.project_id=$1 AND contact.connection_id=$2 AND contact.wa_id=$3 AND preference.status='stopped'
	)`, project, connection, waID).Scan(&stopped)

	return !stopped, err
}

func SetMarketingPreferenceTx(ctx context.Context, tx pgx.Tx, project, contactID, status, detail, source string, occurredAt time.Time) (MarketingPreference, string, bool, error) {
	result := MarketingPreference{}
	if _, err := tx.Exec(ctx, "SELECT pg_advisory_xact_lock(hashtextextended($1,0))", project+":"+contactID+":marketing"); err != nil {
		return result, "", false, err
	}

	previous := ""

	var (
		currentEvent    time.Time
		currentSequence int64
	)

	err := tx.QueryRow(ctx, "SELECT status,last_event_at,sequence FROM contact_marketing_preferences WHERE project_id=$1 AND contact_id=$2", project, contactID).Scan(&previous, &currentEvent, &currentSequence)

	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return result, "", false, err
	}

	if err == nil && occurredAt.Before(currentEvent) {
		result = MarketingPreference{Status: previous, LastEventAt: currentEvent, Sequence: currentSequence}
		return result, previous, false, nil
	}

	sequence := currentSequence
	changed := previous != status

	if changed {
		sequence++
	}

	if sequence == 0 {
		sequence = 1
	}

	err = tx.QueryRow(ctx, `INSERT INTO contact_marketing_preferences(project_id,contact_id,status,detail,source,last_event_at,sequence)
		VALUES($1,$2,$3,$4,$5,$6,$7)
		ON CONFLICT(project_id,contact_id) DO UPDATE SET status=EXCLUDED.status,detail=EXCLUDED.detail,source=EXCLUDED.source,last_event_at=EXCLUDED.last_event_at,sequence=EXCLUDED.sequence,updated_at=now()
		RETURNING status,detail,source,last_event_at,sequence`, project, contactID, status, detail, source, occurredAt, sequence).Scan(&result.Status, &result.Detail, &result.Source, &result.LastEventAt, &result.Sequence)

	return result, previous, changed, err
}

package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"wapo.local/server/internal/store"
)

const contactSelect = `SELECT contact.id,contact.connection_id,contact.customer_id,contact.wa_id,contact.phone_number,contact.business_scoped_user_id,contact.parent_business_scoped_user_id,contact.username,contact.profile_name,contact.display_name,contact.display_name_custom,contact.email,contact.properties,contact.created_at,contact.updated_at,
	coalesce(preference.status,'resumed'),coalesce(preference.detail,''),coalesce(preference.source,''),preference.last_event_at,coalesce(preference.sequence,0),
	connection.data->>'external_id',coalesce(connection.data->>'name','')
	FROM contacts contact JOIN resources connection ON connection.project_id=contact.project_id AND connection.kind='connections' AND connection.id=contact.connection_id
	LEFT JOIN contact_marketing_preferences preference ON preference.project_id=contact.project_id AND preference.contact_id=contact.id`

type rowScanner interface{ Scan(...any) error }

func scanContact(row rowScanner) (store.Object, time.Time, error) {
	var (
		id, connection, customer, waID, phone, businessUserID, parentBusinessUserID, username, profileName, displayName, email, status, detail, source, phoneID, connectionName string
		properties                                                                                                                                                              []byte
		created, updated                                                                                                                                                        time.Time
		eventAt                                                                                                                                                                 *time.Time
		sequence                                                                                                                                                                int64
		displayNameCustom                                                                                                                                                       bool
	)

	err := row.Scan(&id, &connection, &customer, &waID, &phone, &businessUserID, &parentBusinessUserID, &username, &profileName, &displayName, &displayNameCustom, &email, &properties, &created, &updated, &status, &detail, &source, &eventAt, &sequence, &phoneID, &connectionName)
	if err != nil {
		return nil, time.Time{}, err
	}

	var props store.Object

	if err = json.Unmarshal(properties, &props); err != nil {
		return nil, time.Time{}, err
	}

	preference := store.Object{"status": status, "marketing_allowed": status != "stopped", "detail": detail, "source": source, "sequence": sequence}
	if eventAt != nil {
		preference["last_event_at"] = eventAt.UTC().Format(time.RFC3339Nano)
	}

	displaySource := "phone"
	if displayNameCustom {
		displaySource = "local"
	} else if profileName != "" {
		displaySource = "meta"
	} else if username != "" {
		displaySource = "username"
	}

	contact := store.Object{"id": id, "connection_id": connection, "wa_id": waID, "phone_number": phone, "display_name": displayName, "display_name_source": displaySource, "properties": props, "created_at": created.UTC().Format(time.RFC3339Nano), "updated_at": updated.UTC().Format(time.RFC3339Nano), "phone_number_id": phoneID, "marketing_preference": preference}

	for field, value := range map[string]string{"customer_id": customer, "business_scoped_user_id": businessUserID, "parent_business_scoped_user_id": parentBusinessUserID, "username": username, "profile_name": profileName, "email": email, "connection_name": connectionName} {
		if value != "" {
			contact[field] = value
		}
	}

	return contact, updated, nil
}

func readContact(r *http.Request, s *store.Store, project, id string) (store.Object, error) {
	contact, _, err := scanContact(s.Pool.QueryRow(r.Context(), contactSelect+" WHERE contact.project_id=$1 AND contact.id=$2", project, id))
	return contact, err
}

func contactCursor(raw string) (*time.Time, string, error) {
	if raw == "" {
		return nil, "", nil
	}

	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return nil, "", err
	}

	var cursor struct {
		Time time.Time `json:"t"`
		ID   string    `json:"i"`
	}

	if json.Unmarshal(decoded, &cursor) != nil || cursor.Time.IsZero() || cursor.ID == "" {
		return nil, "", fmt.Errorf("invalid cursor")
	}

	return &cursor.Time, cursor.ID, nil
}

func encodeContactCursor(at time.Time, id string) string {
	raw, _ := json.Marshal(store.Object{"t": at, "i": id})
	return base64.RawURLEncoding.EncodeToString(raw)
}

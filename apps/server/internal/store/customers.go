package store

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

func (s *Store) getCustomer(ctx context.Context, project, id string) (Object, error) {
	var (
		name                      string
		externalCustomerID, email *string
		metadata                  []byte
		createdAt                 time.Time
	)

	err := s.Pool.QueryRow(ctx, `SELECT name,external_customer_id,email,metadata,
		created_at FROM customers WHERE project_id=$1 AND id=$2`, project, id).
		Scan(&name, &externalCustomerID, &email, &metadata, &createdAt)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}

	if err != nil {
		return nil, err
	}

	return customerObject(id, name, externalCustomerID, email, metadata, createdAt.UTC().Format(time.RFC3339Nano))
}

func (s *Store) putCustomer(ctx context.Context, project, id string, object Object, create bool) error {
	createdAt, _ := object["created_at"].(string)
	if createdAt == "" {
		createdAt = time.Now().UTC().Format(time.RFC3339Nano)
		object["created_at"] = createdAt
	}

	createdTime, err := time.Parse(time.RFC3339Nano, createdAt)
	if err != nil {
		return fmt.Errorf("invalid customer created_at: %w", err)
	}

	object["id"] = id

	data, err := json.Marshal(object)
	if err != nil {
		return err
	}

	query := "INSERT INTO resources(project_id,kind,id,data,created_at) VALUES($1,'customers',$2,$3,$4)"

	if !create {
		query += " ON CONFLICT(project_id,kind,id) DO UPDATE SET data=EXCLUDED.data"
	}

	_, err = s.Pool.Exec(ctx, query, project, id, data, createdTime)

	return err
}

func (s *Store) deleteCustomer(ctx context.Context, project, id string) error {
	tag, err := s.Pool.Exec(ctx, "DELETE FROM resources WHERE project_id=$1 AND kind='customers' AND id=$2", project, id)
	if err != nil {
		return err
	}

	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	return nil
}

func (s *Store) listCustomers(ctx context.Context, project string, filter map[string]string, after string, limit int) ([]Object, string, error) {
	args := []any{project}
	query := `SELECT id,name,external_customer_id,email,metadata,created_at
		FROM customers WHERE project_id=$1`

	if external := filter["external_customer_id"]; external != "" {
		args = append(args, external)
		query += fmt.Sprintf(" AND external_customer_id=$%d", len(args))
	}

	if after != "" {
		cursorTime, cursorID, err := decodeCustomerCursor(after)
		if err != nil {
			return nil, "", err
		}

		args = append(args, cursorTime, cursorID)
		query += fmt.Sprintf(" AND (created_at,id)<($%d,$%d)", len(args)-1, len(args))
	}

	args = append(args, limit+1)
	query += fmt.Sprintf(" ORDER BY created_at DESC,id DESC LIMIT $%d", len(args))

	rows, err := s.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	objects := []Object{}
	next := ""

	for rows.Next() {
		var (
			id, name                  string
			externalCustomerID, email *string
			metadata                  []byte
			createdAt                 time.Time
		)

		if err = rows.Scan(&id, &name, &externalCustomerID, &email, &metadata, &createdAt); err != nil {
			return nil, "", err
		}

		if len(objects) == limit {
			return objects, next, nil
		}

		object, objectErr := customerObject(id, name, externalCustomerID, email, metadata, createdAt.UTC().Format(time.RFC3339Nano))
		if objectErr != nil {
			return nil, "", objectErr
		}

		objects = append(objects, object)
		next = encodeCustomerCursor(createdAt, id)
	}

	return objects, "", rows.Err()
}

func customerObject(id, name string, externalCustomerID, email *string, metadata []byte, createdAt string) (Object, error) {
	object := Object{"id": id, "name": name, "created_at": createdAt}
	if externalCustomerID != nil {
		object["external_customer_id"] = *externalCustomerID
	}

	if email != nil {
		object["email"] = *email
	}

	if len(metadata) > 0 {
		var value Object

		if err := json.Unmarshal(metadata, &value); err != nil {
			return nil, err
		}

		object["metadata"] = value
	}

	return object, nil
}

func encodeCustomerCursor(createdAt time.Time, id string) string {
	value, _ := json.Marshal(map[string]any{"t": createdAt, "i": id})
	return base64.RawURLEncoding.EncodeToString(value)
}

func decodeCustomerCursor(value string) (time.Time, string, error) {
	raw, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return time.Time{}, "", fmt.Errorf("invalid cursor")
	}

	var cursor struct {
		Time time.Time `json:"t"`
		ID   string    `json:"i"`
	}

	if json.Unmarshal(raw, &cursor) != nil || cursor.Time.IsZero() || cursor.ID == "" {
		return time.Time{}, "", fmt.Errorf("invalid cursor")
	}

	return cursor.Time, cursor.ID, nil
}

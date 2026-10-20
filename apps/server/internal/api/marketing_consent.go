package api

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/store"
)

func (s *Server) recordMarketingPreference(ctx context.Context, projectID string, connection store.Object, waID, profileName, status, detail, source, sourceKey string, occurredAt time.Time) error {
	if waID == "" || (status != "stopped" && status != "resumed") {
		return nil
	}

	tx, err := s.Store.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	contactID, err := store.EnsureContactTx(ctx, tx, projectID, str(connection, "id"), str(connection, "customer_id"), waID, profileName)
	if err != nil {
		return err
	}

	preference, previous, changed, err := store.SetMarketingPreferenceTx(ctx, tx, projectID, contactID, status, detail, source, occurredAt)
	if err != nil {
		return err
	}

	if !changed {
		return tx.Commit(ctx)
	}

	var displayName string

	if err = tx.QueryRow(ctx, "SELECT display_name FROM contacts WHERE project_id=$1 AND id=$2", projectID, contactID).Scan(&displayName); err != nil {
		return err
	}

	payload := store.Object{
		"contact":              store.Object{"id": contactID, "wa_id": waID, "display_name": displayName},
		"marketing_preference": store.Object{"status": preference.Status, "previous_status": previous, "detail": preference.Detail, "source": preference.Source, "occurred_at": preference.LastEventAt.UTC().Format(time.RFC3339Nano), "sequence": preference.Sequence, "marketing_allowed": preference.Status != "stopped"},
		"phone_number_id":      str(connection, "external_id"),
	}
	if err = delivery.RecordTx(ctx, tx, projectID, sourceKey, "whatsapp.contact.marketing_preference_changed", payload, str(connection, "id"), nil); err != nil {
		return err
	}

	return tx.Commit(ctx)
}

func parseMarketingPreference(input store.Object) (string, string, string, time.Time, bool) {
	category := strings.ToLower(firstString(input, "category", "type", "preference_type"))
	if category != "" && !strings.Contains(category, "market") {
		return "", "", "", time.Time{}, false
	}

	waID := normalizedPhone(firstString(input, "wa_id", "recipient_id", "user_id", "phone_number"))
	value := strings.ToLower(firstString(input, "value", "status", "preference"))
	status := ""

	if strings.Contains(value, "stop") || strings.Contains(value, "opt_out") || value == "disabled" {
		status = "stopped"
	} else if strings.Contains(value, "resume") || strings.Contains(value, "opt_in") || value == "enabled" {
		status = "resumed"
	}

	if waID == "" || status == "" {
		return "", "", "", time.Time{}, false
	}

	detail := firstString(input, "detail", "description", "reason")
	occurredAt := parseProviderTime(firstString(input, "timestamp", "occurred_at"))

	return waID, status, detail, occurredAt, true
}

func firstString(input store.Object, fields ...string) string {
	for _, field := range fields {
		if value := str(input, field); value != "" {
			return value
		}
	}

	return ""
}

func parseProviderTime(value string) time.Time {
	if timestamp, err := strconv.ParseInt(value, 10, 64); err == nil && timestamp > 0 {
		return time.Unix(timestamp, 0).UTC()
	}

	if timestamp, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return timestamp.UTC()
	}

	return time.Now().UTC()
}

func providerHasError(input store.Object, expected int) (bool, string) {
	errors, _ := input["errors"].([]any)
	for _, item := range errors {
		errorObject, _ := item.(map[string]any)
		code := fmt.Sprint(errorObject["code"])

		if code == strconv.Itoa(expected) {
			return true, firstString(errorObject, "message", "title")
		}
	}

	return false, ""
}

func providerResponseHasError(input store.Object, expected int) (bool, string) {
	errorObject := object(input, "error")
	if fmt.Sprint(errorObject["code"]) != strconv.Itoa(expected) {
		return false, ""
	}

	return true, firstString(errorObject, "message", "title")
}

func (s *Server) marketingSend(ctx context.Context, projectID string, connection, payload store.Object, path string) (bool, error) {
	if strings.HasSuffix(path, "/marketing_messages") {
		return true, nil
	}

	if str(payload, "type") != "template" {
		return false, nil
	}

	template := object(payload, "template")
	name := str(template, "name")
	language := str(object(template, "language"), "code")

	if name == "" || language == "" {
		return false, nil
	}

	var marketing bool

	err := s.Store.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM template_states WHERE project_id=$1 AND business_account_id=$2 AND data->>'name'=$3 AND data->>'language'=$4 AND data->>'category'='MARKETING')`, projectID, str(connection, "business_account_id"), name, language).Scan(&marketing)

	return marketing, err
}

package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) contacts(w http.ResponseWriter, r *http.Request, id string) {
	switch {
	case r.Method == http.MethodGet && id == "":
		s.listContacts(w, r)
	case r.Method == http.MethodPost && id == "":
		s.createContact(w, r)
	case r.Method == http.MethodGet && id != "":
		s.getContact(w, r, id)
	case r.Method == http.MethodPatch && id != "":
		s.updateContact(w, r, id)
	case r.Method == http.MethodDelete && id != "":
		s.eraseContact(w, r, id)
	default:
		fail(w, http.StatusMethodNotAllowed, "method_not_allowed", "Use GET, POST, PATCH or DELETE")
	}
}

func (s *Server) listContacts(w http.ResponseWriter, r *http.Request) {
	limit := pageLimit(r)
	marketingStatus := r.URL.Query().Get("marketing_status")

	if marketingStatus != "" && marketingStatus != "stopped" && marketingStatus != "resumed" {
		fail(w, http.StatusUnprocessableEntity, "validation_error", "marketing_status must be stopped or resumed")
		return
	}

	args := []any{project(r), strings.TrimSpace(r.URL.Query().Get("search")), r.URL.Query().Get("connection_id"), marketingStatus}

	cursorTime, cursorID, err := contactCursor(r.URL.Query().Get("after"))
	if err != nil {
		fail(w, http.StatusBadRequest, "invalid_cursor", "Invalid contact cursor")
		return
	}

	args = append(args, cursorTime, cursorID, limit+1)

	rows, err := s.Store.Pool.Query(r.Context(), contactSelect+` WHERE contact.project_id=$1
		AND ($2='' OR contact.wa_id ILIKE '%'||$2||'%' OR contact.display_name ILIKE '%'||$2||'%' OR contact.profile_name ILIKE '%'||$2||'%' OR contact.email ILIKE '%'||$2||'%' OR contact.properties::text ILIKE '%'||$2||'%')
		AND ($3='' OR contact.connection_id=$3)
		AND ($4='' OR coalesce(preference.status,'resumed')=$4)
		AND ($5::timestamptz IS NULL OR (contact.updated_at,contact.id)<($5,$6))
		ORDER BY contact.updated_at DESC,contact.id DESC LIMIT $7`, args...)
	if err != nil {
		dbError(w, err)
		return
	}
	defer rows.Close()

	contacts := []store.Object{}

	var lastTime time.Time

	hasMore := false

	for rows.Next() {
		contact, updated, scanErr := scanContact(rows)
		if scanErr != nil {
			dbError(w, scanErr)
			return
		}

		if len(contacts) == limit {
			hasMore = true
			break
		}

		contacts = append(contacts, contact)
		lastTime = updated
	}

	if rows.Err() != nil {
		dbError(w, rows.Err())
		return
	}

	next := ""
	if hasMore {
		next = encodeContactCursor(lastTime, str(contacts[len(contacts)-1], "id"))
	}

	write(w, http.StatusOK, store.Object{"data": contacts, "meta": store.Object{"has_more": next != "", "after": next}})
}

func (s *Server) getContact(w http.ResponseWriter, r *http.Request, id string) {
	contact, err := readContact(r, s.Store, project(r), id)
	if err != nil {
		dbError(w, notFound(err))
		return
	}

	write(w, http.StatusOK, store.Object{"data": contact})
}

func (s *Server) createContact(w http.ResponseWriter, r *http.Request) {
	input, err := decode(r)
	if err != nil {
		fail(w, http.StatusBadRequest, "invalid_json", "Valid JSON required")
		return
	}

	connection, err := s.Store.Get(r.Context(), project(r), "connections", str(input, "connection_id"))
	if err != nil || str(connection, "channel") != "whatsapp" {
		fail(w, http.StatusUnprocessableEntity, "validation_error", "A WhatsApp connection is required")
		return
	}

	phone := normalizedPhone(str(input, "phone_number"))
	if len(phone) < 7 || len(phone) > 15 {
		fail(w, http.StatusUnprocessableEntity, "validation_error", "phone_number must contain 7 to 15 digits including country code")
		return
	}

	if _, ok := input["use_provider_name"]; ok {
		fail(w, http.StatusUnprocessableEntity, "validation_error", "use_provider_name is only available when updating a contact")
		return
	}

	display, email, properties, validationErr := contactEdits(input, store.Object{"display_name": phone, "email": "", "properties": store.Object{}})
	if validationErr != "" {
		fail(w, http.StatusUnprocessableEntity, "validation_error", validationErr)
		return
	}

	id := store.ConversationID(str(connection, "id"), phone)
	data := store.Object{"id": id, "connection_id": str(connection, "id"), "customer_id": str(connection, "customer_id"), "wa_id": phone, "phone_number": phone, "profile_name": "", "display_name": display, "display_name_custom": true, "email": email, "properties": properties, "updated_at": time.Now().UTC().Format(time.RFC3339Nano)}
	raw, _ := json.Marshal(data)

	_, err = s.Store.Pool.Exec(r.Context(), "INSERT INTO resources(project_id,kind,id,data) VALUES($1,'contacts',$2,$3)", project(r), id, raw)
	if err != nil {
		dbError(w, err)
		return
	}

	contact, err := readContact(r, s.Store, project(r), id)
	if err != nil {
		dbError(w, err)
		return
	}

	write(w, http.StatusCreated, store.Object{"data": contact})
}

func (s *Server) updateContact(w http.ResponseWriter, r *http.Request, id string) {
	input, err := decode(r)
	if err != nil {
		fail(w, http.StatusBadRequest, "invalid_json", "Valid JSON required")
		return
	}

	current, err := readContact(r, s.Store, project(r), id)
	if err != nil {
		dbError(w, notFound(err))
		return
	}

	_, hasConnection := input["connection_id"]
	_, hasPhone := input["phone_number"]

	if hasConnection || hasPhone {
		fail(w, http.StatusUnprocessableEntity, "validation_error", "connection_id and phone_number cannot be changed")
		return
	}

	display, email, properties, validationErr := contactEdits(input, current)
	if validationErr != "" {
		fail(w, http.StatusUnprocessableEntity, "validation_error", validationErr)
		return
	}

	if len(input) == 0 {
		fail(w, http.StatusUnprocessableEntity, "validation_error", "At least one contact field is required")
		return
	}

	displayCustom := str(current, "display_name_source") == "local"
	if _, changed := input["display_name"]; changed {
		displayCustom = true
	}

	if value, reset := input["use_provider_name"]; reset {
		useProvider, valid := value.(bool)
		if !valid || !useProvider {
			fail(w, http.StatusUnprocessableEntity, "validation_error", "use_provider_name must be true when provided")
			return
		}

		display = firstString(current, "profile_name", "username", "phone_number")
		displayCustom = false
	}

	patch := store.Object{"display_name": display, "display_name_custom": displayCustom, "email": email, "properties": properties, "updated_at": time.Now().UTC().Format(time.RFC3339Nano)}
	raw, _ := json.Marshal(patch)

	tag, err := s.Store.Pool.Exec(r.Context(), "UPDATE resources SET data=data||$3::jsonb WHERE project_id=$1 AND kind='contacts' AND id=$2", project(r), id, raw)
	if err != nil {
		dbError(w, err)
		return
	}

	if tag.RowsAffected() == 0 {
		fail(w, http.StatusNotFound, "not_found", "Contact not found")
		return
	}

	contact, err := readContact(r, s.Store, project(r), id)
	if err != nil {
		dbError(w, err)
		return
	}

	write(w, http.StatusOK, store.Object{"data": contact})
}

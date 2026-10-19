package api

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"wapo.local/server/internal/store"
)

var accentPattern = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func (s *Server) projectSettings(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")

	switch r.Method {
	case "GET":
		o, e := s.readProject(r, project(r))
		if e != nil {
			dbError(w, e)
			return
		}

		write(w, 200, store.Object{"data": o})
	case "PATCH":
		input, e := decode(r)
		if e != nil {
			fail(w, 400, "invalid_json", "Valid JSON required")
			return
		}

		name := ""

		if value, ok := input["name"]; ok {
			var valid bool

			name, valid = value.(string)
			name = strings.TrimSpace(name)

			if !valid || name == "" || len(name) > 120 {
				fail(w, 422, "validation_error", "name must contain 1 to 120 bytes")
				return
			}
		}

		patch := store.Object{}

		if value, ok := input["branding"]; ok {
			branding, valid := value.(map[string]any)
			if !valid {
				fail(w, 422, "validation_error", "branding must be an object")
				return
			}

			for field, value := range branding {
				text, valid := value.(string)
				if !valid {
					fail(w, 422, "validation_error", "Branding values must be strings")
					return
				}

				switch field {
				case "accent_color":
					valid = accentPattern.MatchString(text)
				case "theme":
					valid = text == "light" || text == "dark"
				case "logo_data_url":
					valid = validProjectLogo(text)
				default:
					valid = false
				}

				if !valid {
					fail(w, 422, "validation_error", "Invalid branding field: "+field)
					return
				}

				patch[field] = text
				if field == "logo_data_url" {
					patch["logo_id"] = ""
					if text != "" {
						patch["logo_id"] = store.Hash(text)
					}
				}
			}
		}

		if name == "" && len(patch) == 0 {
			fail(w, 422, "validation_error", "name or branding is required")
			return
		}

		raw, _ := json.Marshal(patch)

		result, e := s.Store.Pool.Exec(r.Context(), `UPDATE projects SET name=CASE WHEN $2='' THEN name ELSE $2 END, branding=branding || $3::jsonb WHERE id=$1`, project(r), name, raw)
		if e != nil {
			dbError(w, e)
			return
		}

		if result.RowsAffected() == 0 {
			fail(w, 404, "not_found", "Project not found")
			return
		}

		o, e := s.readProject(r, project(r))
		if e != nil {
			dbError(w, e)
			return
		}

		write(w, 200, store.Object{"data": o})
	default:
		fail(w, 405, "method_not_allowed", "Use GET or PATCH")
	}
}

func (s *Server) readProject(r *http.Request, id string) (store.Object, error) {
	var (
		name, status string
		raw          []byte
	)

	e := s.Store.Pool.QueryRow(r.Context(), "SELECT name,status,branding FROM projects WHERE id=$1", id).Scan(&name, &status, &raw)
	if e != nil {
		return nil, notFound(e)
	}

	var branding store.Object

	if e = json.Unmarshal(raw, &branding); e != nil {
		return nil, e
	}

	logoURL := projectLogoURL(id, str(branding, "logo_id"))
	delete(branding, "logo_id")

	return store.Object{"id": id, "name": name, "status": status, "branding": branding, "logo_url": logoURL}, nil
}

package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/aarondl/authboss/v3"
	"wapo.local/server/internal/store"
)

type authValues struct{ page, email, password, token, name, language string }

func (v authValues) GetPID() string      { return v.email }
func (v authValues) GetPassword() string { return v.password }
func (v authValues) GetToken() string    { return v.token }
func (v authValues) GetValues() map[string]string {
	return map[string]string{"name": v.name, "language": v.language}
}

func (v authValues) Validate() []error {
	if v.page == "register" && v.language != "" && v.language != "es" && v.language != "en" && v.language != "pt" {
		return []error{fmt.Errorf("language must be es, en or pt")}
	}

	if v.page == "register" || v.page == "recover_start" {
		if _, err := store.NormalizeEmail(v.email); err != nil {
			return []error{err}
		}
	}

	if v.page == "register" && (v.name == "" || len(v.name) > 120) {
		return []error{fmt.Errorf("name must contain 1 to 120 bytes")}
	}

	if (v.page == "register" || v.page == "recover_end") && (len(v.password) < 12 || len(v.password) > 72) {
		return []error{fmt.Errorf("password must contain between 12 and 72 bytes")}
	}

	if (v.page == "confirm" || v.page == "recover_end") && v.token == "" {
		return []error{fmt.Errorf("token is required")}
	}

	return nil
}

type authParsedBody struct{ input store.Object }

func (b authParsedBody) Read(page string, _ *http.Request) (authboss.Validator, error) {
	input := b.input
	return authValues{page: page, email: strings.ToLower(strings.TrimSpace(str(input, "email"))), password: str(input, "password"), token: str(input, "token"), name: strings.TrimSpace(str(input, "name")), language: str(input, "language")}, nil
}

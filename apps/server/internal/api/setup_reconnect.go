package api

import (
	"net/http"
	"strings"
	"unicode"

	"wapo.local/server/internal/store"
)

func normalizedPhone(value string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsDigit(r) {
			return r
		}

		return -1
	}, value)
}

func (s *Server) reconnectTarget(r *http.Request, customer, number string) (store.Object, error) {
	rows, _, e := s.Store.List(r.Context(), project(r), "connections", map[string]string{"channel": "whatsapp", "customer_id": customer}, "", 100)
	if e != nil {
		return nil, e
	}

	for _, c := range rows {
		if str(c, "external_id") == number || (normalizedPhone(number) != "" && normalizedPhone(str(c, "display_phone_number")) == normalizedPhone(number)) {
			return c, nil
		}
	}

	return nil, store.ErrNotFound
}

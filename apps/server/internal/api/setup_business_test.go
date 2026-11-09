package api

import (
	"strings"
	"testing"

	"wapo.local/server/internal/store"
)

func TestMetaBusinessNameRemovesCharactersMetaRejects(t *testing.T) {
	for raw, want := range map[string]string{
		"customer_1":         "Customer 1",
		"Demo Store":         "Demo Store",
		"Tienda de Ani":      "Tienda de Ani",
		"  acme__store!! ":   "Acme store",
		"Café & Co.":         "Café & Co",
		"O'Brien-Smith":      "O'Brien-Smith",
		"shop@home #1":       "Shop home 1",
		"___":                "",
		"12345":              "",
		"":                   "",
		"store™ <script>":    "Store script",
		"mi_tienda_en_línea": "Mi tienda en línea",
		"nubea.ecomm":        "Nubea.ecomm",
		"--- Ventas ---":     "Ventas",
		"emoji 😀 store":      "Emoji store",
	} {
		if got := metaBusinessName(raw); got != want {
			t.Errorf("metaBusinessName(%q) = %q, want %q", raw, got, want)
		}
	}
}

func TestMetaBusinessNameRespectsLengthLimit(t *testing.T) {
	got := metaBusinessName(strings.Repeat("a", 100))
	if len([]rune(got)) > metaBusinessNameLimit || !strings.HasPrefix(got, "A") {
		t.Fatalf("unexpected long name %q", got)
	}
}

func TestSetupBusinessOmitsValuesMetaRejects(t *testing.T) {
	got := setupBusiness(store.Object{"name": "customer_1", "email": "owner@example.com"})
	if got["name"] != "Customer 1" || got["email"] != "owner@example.com" {
		t.Fatalf("unexpected business %#v", got)
	}

	got = setupBusiness(store.Object{"name": "___", "email": "not an email"})
	if len(got) != 0 {
		t.Fatalf("invalid values must be omitted, got %#v", got)
	}
}

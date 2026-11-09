package api

import (
	"net/mail"
	"strings"
	"unicode"

	"wapo.local/server/internal/store"
)

// metaBusinessNameLimit keeps prefilled names within Meta's business name length.
const metaBusinessNameLimit = 75

// setupBusiness returns the customer fields used to prefill Embedded Signup.
// Meta rejects business names with underscores or symbols, so values it would
// reject are cleaned or omitted; the customer can still edit them in Meta.
func setupBusiness(customer store.Object) store.Object {
	business := store.Object{}

	if name := metaBusinessName(str(customer, "name")); name != "" {
		business["name"] = name
	}

	if email := strings.TrimSpace(str(customer, "email")); email != "" {
		if address, e := mail.ParseAddress(email); e == nil && address.Address == email {
			business["email"] = email
		}
	}

	return business
}

func metaBusinessName(raw string) string {
	var b strings.Builder

	for _, r := range raw {
		switch {
		case unicode.IsLetter(r), unicode.IsDigit(r):
			b.WriteRune(r)
		case strings.ContainsRune(" .,&'-", r):
			b.WriteRune(r)
		default:
			b.WriteRune(' ')
		}
	}

	name := strings.Join(strings.Fields(b.String()), " ")
	name = strings.Trim(name, " .,&'-")

	if !strings.ContainsFunc(name, unicode.IsLetter) {
		return ""
	}

	if !strings.ContainsFunc(name, unicode.IsUpper) {
		runes := []rune(name)
		for i, r := range runes {
			if unicode.IsLetter(r) {
				runes[i] = unicode.ToUpper(r)
				break
			}
		}

		name = string(runes)
	}

	if runes := []rune(name); len(runes) > metaBusinessNameLimit {
		name = strings.TrimRight(string(runes[:metaBusinessNameLimit]), " .,&'-")
	}

	return name
}

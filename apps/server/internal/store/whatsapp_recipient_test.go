package store

import "testing"

func TestConfirmedWhatsAppIdentity(t *testing.T) {
	input := "541132647689"
	for _, test := range []struct {
		name     string
		response Object
		want     string
	}{
		{"confirmed", Object{"contacts": []any{Object{"input": input, "wa_id": "5491132647689"}}}, "5491132647689"},
		{"missing", Object{}, input},
		{"unrelated", Object{"contacts": []any{Object{"input": "15551234567", "wa_id": "5491132647689"}}}, input},
		{"empty", Object{"contacts": []any{Object{"input": input, "wa_id": ""}}}, input},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := ConfirmedWhatsAppIdentity(test.response, input); got != test.want {
				t.Fatalf("got %q, want %q", got, test.want)
			}
		})
	}
}

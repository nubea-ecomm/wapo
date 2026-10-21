package notification

import (
	"encoding/json"
	"fmt"

	"wapo.local/server/internal/store"
)

func renderAuthMail(s *store.Store, delivery queuedDelivery) (Message, error) {
	plain, err := s.Unseal(text(delivery.Payload, "invitation_token", ""), text(delivery.Payload, "invitation_id", ""))
	if err != nil || plain == "" {
		return Message{}, fmt.Errorf("cannot decrypt authentication email")
	}

	var body struct {
		Subject string `json:"subject"`
		Text    string `json:"text"`
		HTML    string `json:"html"`
	}

	if err = json.Unmarshal([]byte(plain), &body); err != nil {
		return Message{}, fmt.Errorf("invalid authentication email")
	}

	return Message{To: delivery.Recipients, Subject: body.Subject, Text: body.Text, HTML: body.HTML}, nil
}

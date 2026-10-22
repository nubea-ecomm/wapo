package api

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"wapo.local/server/internal/store"
)

type messageReferenceError string

func (e messageReferenceError) Error() string { return string(e) }

func reactionFingerprint(message store.Object) string {
	reaction := object(message, "reaction")
	raw, _ := json.Marshal(store.Object{"from": message["from"], "timestamp": message["timestamp"], "message_id": reaction["message_id"], "emoji": str(reaction, "emoji")})

	return store.Hash(string(raw))
}

func (s *Server) validateMessageReference(ctx context.Context, p, connection, recipient string, payload store.Object) error {
	reaction := str(payload, "type") == "reaction"
	id := str(object(payload, "context"), "message_id")

	if reaction {
		value := object(payload, "reaction")

		var ok bool

		emoji, ok := value["emoji"].(string)

		if !ok || utf8.RuneCountInString(emoji) > 32 || strings.IndexFunc(emoji, func(r rune) bool { return unicode.IsLetter(r) || unicode.IsSpace(r) || unicode.IsControl(r) }) >= 0 {
			return messageReferenceError("reaction.emoji must be an emoji or an empty string to remove it")
		}

		id = str(value, "message_id")
		if id == "" {
			return messageReferenceError("reaction.message_id is required")
		}
	}

	if id == "" {
		if object(payload, "context") != nil {
			return messageReferenceError("context.message_id is required")
		}

		return nil
	}

	target, err := s.Store.Get(ctx, p, "messages", id)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return err
	}

	if err != nil || str(target, "connection_id") != connection || str(target, "conversation_id") != store.ConversationID(connection, recipient) || str(object(target, "payload"), "type") == "reaction" || str(target, "status") == "failed" {
		return messageReferenceError("referenced message is not available in this conversation")
	}

	if reaction && (str(target, "direction") != "inbound" || time.Since(parseProviderTime(str(target, "timestamp"))) > 30*24*time.Hour) {
		return messageReferenceError("reactions require a received message less than 30 days old")
	}

	return nil
}

package api

import (
	"fmt"

	"wapo.local/server/internal/store"
)

func validateCustomer(input store.Object) error {
	for _, key := range []string{"name", "email", "external_customer_id"} {
		if value, present := input[key]; present {
			if _, ok := value.(string); !ok {
				return fmt.Errorf("%s must be a string", key)
			}
		}
	}

	if value, present := input["metadata"]; present {
		if _, ok := value.(map[string]any); !ok {
			return fmt.Errorf("metadata must be a JSON object")
		}
	}

	return nil
}

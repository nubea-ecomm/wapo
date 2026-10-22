package api

import "wapo.local/server/internal/store"

type metaMessageEnvelope struct {
	Entry []struct {
		ID      string `json:"id"`
		Time    int64  `json:"time"`
		Changes []struct {
			Value struct {
				Metadata struct {
					PhoneID string `json:"phone_number_id"`
				} `json:"metadata"`
				Calls           []store.Object `json:"calls"`
				Messages        []store.Object `json:"messages"`
				Statuses        []store.Object `json:"statuses"`
				UserPreferences []store.Object `json:"user_preferences"`
				Contacts        []struct {
					Profile struct {
						Name string `json:"name"`
					} `json:"profile"`
					WAID string `json:"wa_id"`
				} `json:"contacts"`
			} `json:"value"`
		} `json:"changes"`
	} `json:"entry"`
}

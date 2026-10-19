package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"wapo.local/server/internal/store"
	"wapo.local/server/internal/templatesync"
)

func (s *Server) relayMeta(w http.ResponseWriter, r *http.Request, c store.Object, path, assetKind string) {
	token, e := s.Store.Unseal(str(c, "access_token"), project(r))
	if e != nil {
		fail(w, 500, "credential_error", "Cannot read connection credentials")
		return
	}

	query := r.URL.Query()
	for _, field := range []string{"access_token", "appsecret_proof", "phone_number_id", "business_account_id", "hsm_id"} {
		query.Del(field)
	}

	target := s.Meta.BaseURL + "/" + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}

	started := time.Now()

	var (
		templateDraft store.Object
		requestBody   io.Reader = r.Body
	)

	if assetKind == "template" && r.Method == "POST" {
		raw, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
		if err != nil || json.Unmarshal(raw, &templateDraft) != nil {
			fail(w, 400, "invalid_json", "Valid template JSON required")
			return
		}

		requestBody = bytes.NewReader(raw)
	}

	if payload, ok := r.Context().Value(metaBodyKey).(store.Object); ok {
		raw, _ := json.Marshal(payload)
		requestBody = bytes.NewReader(raw)
	}

	req, e := http.NewRequestWithContext(r.Context(), r.Method, target, requestBody)
	if e != nil {
		fail(w, 400, "invalid_request", "Invalid Meta request")
		return
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", r.Header.Get("Content-Type"))

	if req.Header.Get("Content-Type") == "" {
		req.Header.Set("Content-Type", "application/json")
	}

	client := s.HTTP
	if s.Meta.Client != nil {
		client = s.Meta.Client
	}

	res, e := client.Do(req)
	if e != nil {
		fail(w, 502, "provider_unavailable", "Meta request failed")
		return
	}
	defer res.Body.Close()

	if res.StatusCode >= 300 && res.StatusCode < 400 {
		fail(w, 502, "provider_redirect", "Unexpected Meta redirect")
		return
	}

	raw, e := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if e != nil || !json.Valid(raw) {
		fail(w, 502, "provider_error", "Invalid Meta response")
		return
	}

	var body store.Object

	json.Unmarshal(raw, &body)

	if res.StatusCode >= 200 && res.StatusCode < 300 && assetKind != "" {
		if id := str(body, "id"); id != "" {
			if e = s.rememberMetaAsset(r, c, assetKind, id); e != nil {
				dbError(w, e)
				return
			}
		}

		list, _ := body["data"].([]any)
		for _, item := range list {
			o, _ := item.(map[string]any)
			if e = s.rememberMetaAsset(r, c, assetKind, str(o, "id")); e != nil {
				dbError(w, e)
				return
			}
		}
	}

	if assetKind == "template" && res.StatusCode >= 200 && res.StatusCode < 300 {
		observe := func(snapshot store.Object) error {
			return templatesync.Observe(r.Context(), s.Store, project(r), str(c, "business_account_id"), str(c, "id"), snapshot, "api", started, 0)
		}

		if r.Method == "POST" && str(body, "id") != "" {
			if templateDraft == nil {
				templateDraft = store.Object{}
			}

			for _, field := range []string{"id", "status", "category"} {
				if value, ok := body[field]; ok {
					templateDraft[field] = value
				}
			}

			if e = observe(templateDraft); e != nil {
				dbError(w, e)
				return
			}
		} else if r.Method == "GET" {
			if str(body, "id") != "" {
				if e = observe(body); e != nil {
					dbError(w, e)
					return
				}
			}

			list, _ := body["data"].([]any)
			for _, item := range list {
				snapshot, _ := item.(map[string]any)
				if e = observe(snapshot); e != nil {
					dbError(w, e)
					return
				}
			}
		}

		if r.Method != "GET" {
			if _, e = s.Store.Pool.Exec(r.Context(), "UPDATE template_sync_accounts SET next_sync_at=now() WHERE project_id=$1 AND business_account_id=$2", project(r), str(c, "business_account_id")); e != nil {
				dbError(w, e)
				return
			}
		}
	}

	if paging := object(body, "paging"); paging != nil {
		for _, field := range []string{"next", "previous"} {
			if original := str(paging, field); original != "" {
				u, e := url.Parse(original)
				if e == nil {
					q := u.Query()
					q.Del("access_token")
					q.Del("appsecret_proof")

					u.Scheme = ""
					u.Host = ""
					u.Path = r.URL.Path
					u.RawQuery = q.Encode()
					paging[field] = u.String()
				} else {
					delete(paging, field)
				}
			}
		}
	}

	if assetKind == "media" && r.Method == "GET" && res.StatusCode == 200 {
		if rawURL := str(body, "url"); rawURL != "" {
			body["download_url"] = s.mediaDownloadLink(r, rawURL, str(c, "id"))
		}
	}

	if strings.HasSuffix(path, "/calls") && r.Method == "POST" && res.StatusCode < 300 && str(body, "call_id") != "" {
		id := str(body, "call_id")
		record := store.Object{"id": id, "call_id": id, "connection_id": c["id"], "phone_number_id": c["external_id"], "status": "initiated", "direction": "business_initiated"}

		if e = s.Store.Put(r.Context(), project(r), "calls", id, record, false); e != nil {
			dbError(w, e)
			return
		}
	}

	write(w, res.StatusCode, body)
}

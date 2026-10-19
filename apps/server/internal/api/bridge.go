package api

import (
	"bytes"
	"io"
	"net/http"
	"strings"
)

func (s *Server) bridgeEnabled(r *http.Request) bool {
	return s.Config.BridgeKey != "" && project(r) == s.Config.BridgeProject
}

func (s *Server) bridge(w http.ResponseWriter, r *http.Request, base, prefix string) {
	suffix := strings.TrimPrefix(r.URL.EscapedPath(), prefix)
	u := strings.TrimRight(base, "/") + "/" + strings.TrimLeft(suffix, "/")
	q := r.URL.Query()
	q.Del("access_token")
	q.Del("appsecret_proof")

	if len(q) > 0 {
		u += "?" + q.Encode()
	}

	body, e := io.ReadAll(r.Body)
	if e != nil {
		fail(w, 413, "body_too_large", "Request body exceeds limit")
		return
	}

	req, e := http.NewRequestWithContext(r.Context(), r.Method, u, bytes.NewReader(body))
	if e != nil {
		fail(w, 400, "invalid_request", "Invalid upstream request")
		return
	}

	req.Header.Set("X-API-Key", s.Config.BridgeKey)
	req.Header.Set("Content-Type", r.Header.Get("Content-Type"))

	if key := r.Header.Get("Idempotency-Key"); key != "" {
		req.Header.Set("Idempotency-Key", key)
	}

	res, e := s.HTTP.Do(req)
	if e != nil {
		fail(w, 502, "upstream_unavailable", "Upstream bridge request failed; reconcile sends before retrying")
		return
	}
	defer res.Body.Close()
	// No redirects, cookies, or upstream authentication headers cross the boundary.
	if res.StatusCode >= 300 && res.StatusCode < 400 {
		fail(w, 502, "upstream_redirect", "Unexpected upstream redirect")
		return
	}

	raw, e := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if e != nil {
		fail(w, 502, "upstream_error", "Cannot read upstream response")
		return
	}

	if v := res.Header.Get("Retry-After"); v != "" {
		w.Header().Set("Retry-After", v)
	}

	rawJSON(w, res.StatusCode, raw)
}

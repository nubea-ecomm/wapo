package api

import (
	"encoding/base64"
	"net/http"
	"net/url"
	"strings"
)

func projectLogoURL(project, hash string) string {
	if hash == "" {
		return ""
	}

	return "/public/projects/" + url.PathEscape(project) + "/logo/" + hash
}

func (s *Server) projectLogo(w http.ResponseWriter, r *http.Request) {
	hash := r.PathValue("hash")
	if len(hash) != 64 {
		http.NotFound(w, r)
		return
	}

	var value string

	e := s.Store.Pool.QueryRow(r.Context(), `SELECT branding->>'logo_data_url' FROM projects WHERE id=$1 AND branding->>'logo_id'=$2`, r.PathValue("project"), hash).Scan(&value)

	if e != nil || !validProjectLogo(value) || value == "" {
		http.NotFound(w, r)
		return
	}

	prefix, encoded, _ := strings.Cut(value, ",")

	raw, e := base64.StdEncoding.DecodeString(encoded)
	if e != nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", strings.TrimSuffix(strings.TrimPrefix(prefix, "data:"), ";base64"))
	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox")
	w.Write(raw)
}

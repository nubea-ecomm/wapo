package api

import (
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"wapo.local/server/internal/store"
)

func (s *Server) mediaDownloadLink(r *http.Request, rawURL, connection string) string {
	raw, _ := json.Marshal(store.Object{"url": rawURL, "connection_id": connection, "expires_at": time.Now().Add(10 * time.Minute).Unix()})
	token := s.Store.Seal(string(raw), "media-download:"+project(r))
	return strings.TrimRight(s.Config.PublicURL, "/") + "/meta/whatsapp/" + s.Config.MetaVersion + "/media_download?token=" + url.QueryEscape(token)
}
func (s *Server) downloadMetaMedia(w http.ResponseWriter, r *http.Request) {
	raw, e := s.Store.Unseal(r.URL.Query().Get("token"), "media-download:"+project(r))
	if e != nil {
		fail(w, 403, "invalid_download_token", "Invalid or expired download token")
		return
	}
	var config struct {
		URL        string `json:"url"`
		Connection string `json:"connection_id"`
		Expires    int64  `json:"expires_at"`
	}
	if json.Unmarshal([]byte(raw), &config) != nil || config.Expires <= time.Now().Unix() {
		fail(w, 403, "invalid_download_token", "Invalid or expired download token")
		return
	}
	c, e := s.Store.Get(r.Context(), project(r), "connections", config.Connection)
	if e != nil {
		dbError(w, e)
		return
	}
	target, e := url.Parse(config.URL)
	if e != nil || target.User != nil {
		fail(w, 422, "invalid_media_url", "Invalid Meta media URL")
		return
	}
	host := strings.ToLower(target.Hostname())
	allowed := false
	for _, domain := range []string{"fbsbx.com", "fbcdn.net", "whatsapp.net", "facebook.com"} {
		if host == domain || strings.HasSuffix(host, "."+domain) {
			allowed = true
		}
	}
	if (!allowed || target.Scheme != "https" || (target.Port() != "" && target.Port() != "443")) && !s.Config.AllowPrivateWebhooks {
		fail(w, 422, "invalid_media_url", "Media download must use a Meta HTTPS host")
		return
	}
	token, e := s.Store.Unseal(str(c, "access_token"), project(r))
	if e != nil {
		fail(w, 500, "credential_error", "Cannot read connection credentials")
		return
	}
	req, e := http.NewRequestWithContext(r.Context(), "GET", config.URL, nil)
	if e != nil {
		fail(w, 422, "invalid_media_url", "Invalid Meta media URL")
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)
	res, e := s.HTTP.Do(req)
	if e != nil {
		fail(w, 502, "provider_unavailable", "Media download failed")
		return
	}
	defer res.Body.Close()
	if res.StatusCode != 200 {
		fail(w, 502, "provider_error", "Meta media download was not successful")
		return
	}
	w.Header().Set("Content-Type", res.Header.Get("Content-Type"))
	w.Header().Set("Content-Disposition", "attachment")
	w.Header().Set("Cache-Control", "no-store")
	io.Copy(w, io.LimitReader(res.Body, 100<<20))
}

package api

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func TestMediaDownloadCapabilityRequiresProjectAndLiveConnection(t *testing.T) {
	s, h, p, key := fixture(t)
	calls := 0
	media := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++

		if r.Header.Get("Authorization") != "Bearer stored-secret" {
			t.Error("wrong media credential")
		}

		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte("fake-media"))
	}))

	defer media.Close()

	if e := s.Store.Put(context.Background(), p, "connections", "media-connection", store.Object{"id": "media-connection", "channel": "whatsapp", "business_account_id": "media-test-account", "access_token": s.Store.Seal("stored-secret", p)}, true); e != nil {
		t.Fatal(e)
	}

	capability := func(expiry int64) string {
		raw, _ := json.Marshal(store.Object{"url": media.URL, "connection_id": "media-connection", "expires_at": expiry})
		return "/meta/whatsapp/v24.0/media_download?token=" + url.QueryEscape(s.Store.Seal(string(raw), "media-download:"+p))
	}
	path := capability(time.Now().Add(time.Minute).Unix())
	req, _ := http.NewRequest("GET", h.URL+path, nil)
	req.Header.Set("X-API-Key", key)

	res, e := http.DefaultClient.Do(req)
	if e != nil {
		t.Fatal(e)
	}

	raw, _ := io.ReadAll(res.Body)
	res.Body.Close()

	if res.StatusCode != 200 || string(raw) != "fake-media" || res.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("media download failed")
	}

	_, _, _, otherKey := fixture(t)
	status, body := request(t, h.URL, otherKey, "GET", path, nil, "")
	expect(t, status, 403, body)
	status, body = request(t, h.URL, key, "GET", capability(time.Now().Add(-time.Minute).Unix()), nil, "")
	expect(t, status, 403, body)
	status, body = request(t, h.URL, "", "GET", path, nil, "")
	expect(t, status, 401, body)
	s.Store.Delete(context.Background(), p, "connections", "media-connection")

	status, body = request(t, h.URL, key, "GET", path, nil, "")
	expect(t, status, 404, body)

	if calls != 1 {
		t.Fatal("invalid capability reached media provider")
	}
}

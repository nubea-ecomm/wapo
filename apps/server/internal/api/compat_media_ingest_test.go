package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"wapo.local/server/internal/store"
)

func TestCompatMediaIngestReturnsResumableHandle(t *testing.T) {
	s, h, p, key := fixture(t)
	s.Config.MetaAppID = "app1"
	s.Config.MetaVersion = "v24.0"
	ctx := context.Background()
	c := store.Object{"id": "ingest-con", "channel": "whatsapp", "external_id": "ingest-phone", "business_account_id": "ingest-waba", "access_token": s.Store.Seal("ingest-secret", p), "status": "connected"}

	if e := s.Store.Put(ctx, p, "connections", "ingest-con", c, true); e != nil {
		t.Fatal(e)
	}

	png := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{1}, 1000)...)

	var downloads atomic.Int32

	source := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		downloads.Add(1)

		switch r.URL.Path {
		case "/large.png":
			w.Write(append([]byte("\x89PNG\r\n\x1a\n"), make([]byte, 5<<20)...))
		case "/page.png":
			w.Write([]byte("<!doctype html><title>Not found</title>"))
		case "/missing.png":
			http.NotFound(w, r)
		default:
			w.Write(png)
		}
	}))
	defer source.Close()

	var uploaded []byte

	failUpload := false
	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.Header.Get("Authorization") != "OAuth ingest-secret" {
			t.Errorf("unexpected Meta request %s %s auth=%q", r.Method, r.URL.Path, r.Header.Get("Authorization"))
		}

		switch r.URL.Path {
		case "/v24.0/app1/uploads":
			q := r.URL.Query()
			if q.Get("file_name") != "banner.png" || q.Get("file_length") != "1008" || q.Get("file_type") != "image/png" {
				t.Errorf("upload session query %v", q)
			}

			if failUpload {
				write(w, 400, store.Object{"error": store.Object{"code": 100, "message": "Invalid token ingest-secret"}})
				return
			}

			write(w, 200, store.Object{"id": "upload:c2Vzc2lvbg==?sig=ARZsig"})
		case "/v24.0/upload:c2Vzc2lvbg==":
			if r.URL.Query().Get("sig") != "ARZsig" || r.Header.Get("file_offset") != "0" {
				t.Errorf("upload transfer query=%v offset=%q", r.URL.Query(), r.Header.Get("file_offset"))
			}

			uploaded, _ = io.ReadAll(r.Body)

			write(w, 200, store.Object{"h": "4::aW1hZ2UvcG5n:handle"})
		default:
			t.Errorf("unexpected Meta path %s", r.URL.Path)
		}
	}))

	defer meta.Close()

	s.Meta.BaseURL = meta.URL
	ingest := func(apiKey string, fields store.Object) (int, store.Object) {
		input := store.Object{"phone_number_id": "ingest-phone", "source": source.URL + "/banner.png", "delivery": "meta_resumable_asset", "filename": "banner.png", "mime_type": "image/png"}
		for k, v := range fields {
			input[k] = v
		}

		return request(t, h.URL, apiKey, "POST", "/platform/v1/whatsapp/media", store.Object{"media_ingest": input}, "")
	}

	status, body := ingest(key, nil)
	expect(t, status, 200, body)

	target := object(object(body, "data"), "target")
	if str(target, "kind") != "meta_resumable_asset" || str(target, "handle") != "4::aW1hZ2UvcG5n:handle" || !bytes.Equal(uploaded, png) {
		t.Fatalf("target=%v uploaded=%d bytes", target, len(uploaded))
	}

	_, _, _, foreign := fixture(t)
	before := downloads.Load()
	status, body = ingest(foreign, nil)
	expect(t, status, 404, body)

	if downloads.Load() != before {
		t.Fatal("a foreign project made Wapo fetch the source")
	}

	for _, tc := range []struct {
		fields store.Object
		status int
		code   string
	}{
		{store.Object{"delivery": "meta_media"}, 501, "media_delivery_not_implemented"},
		{store.Object{"delivery": "url"}, 422, "validation_error"},
		{store.Object{"mime_type": "image/gif"}, 422, "unsupported_media_type"},
		{store.Object{"source": ""}, 422, "validation_error"},
		{store.Object{"source": source.URL + "/large.png"}, 413, "media_too_large"},
		{store.Object{"source": source.URL + "/page.png"}, 422, "media_type_mismatch"},
		{store.Object{"source": source.URL + "/page.png", "mime_type": "video/mp4"}, 422, "media_type_mismatch"},
		{store.Object{"source": source.URL + "/missing.png"}, 422, "source_unavailable"},
	} {
		status, body = ingest(key, tc.fields)
		if status != tc.status || str(object(body, "error"), "code") != tc.code {
			t.Errorf("%v: HTTP %d %v, want %d %s", tc.fields, status, body, tc.status, tc.code)
		}
	}

	// The production policy: HTTPS only and never a non-public address.
	s.Config.AllowPrivateWebhooks = false

	for source, code := range map[string]string{source.URL + "/banner.png": "invalid_source_url", "https://localhost/banner.png": "source_not_allowed", "https://169.254.169.254/latest/meta-data": "source_not_allowed", "https://10.1.2.3/banner.png": "source_not_allowed"} {
		status, body = ingest(key, store.Object{"source": source})
		if status != 422 || str(object(body, "error"), "code") != code {
			t.Errorf("%s: HTTP %d %v, want 422 %s", source, status, body, code)
		}
	}

	s.Config.AllowPrivateWebhooks = true
	failUpload = true
	status, body = ingest(key, nil)
	expect(t, status, 502, body)

	raw, _ := json.Marshal(body)
	if str(object(body, "error"), "code") != "meta_upload_failed" || strings.Contains(string(raw), "ingest-secret") {
		t.Fatalf("Meta failure must be explained without credentials: %s", raw)
	}

	s.Config.MetaAppID = ""
	status, body = ingest(key, nil)
	expect(t, status, 503, body)
}

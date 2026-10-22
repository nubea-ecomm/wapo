package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func TestConversationUploadAndStructuredReply(t *testing.T) {
	s, h, p, key := fixture(t)
	ctx := context.Background()
	con := store.ID("con")
	c := store.Object{"id": con, "channel": "whatsapp", "status": "connected", "external_id": "123000", "business_account_id": "123001", "access_token": s.Store.Seal("fake-media-token", p)}

	if err := s.Store.Put(ctx, p, "connections", con, c, true); err != nil {
		t.Fatal(err)
	}

	chat := store.ConversationID(con, "15550000001")
	if err := s.Store.Put(ctx, p, "conversations", chat, store.Object{"id": chat, "connection_id": con, "contact": "15550000001", "channel": "whatsapp", "status": "open", "service_window_expires_at": time.Now().Add(time.Hour).Format(time.RFC3339Nano)}, true); err != nil {
		t.Fatal(err)
	}

	uploads, sends := 0, 0
	download := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer fake-media-token" {
			t.Error("media download lost scoped credentials")
		}

		w.Header().Set("Content-Type", "application/pdf")
		w.Write([]byte("%PDF-fake"))
	}))

	defer download.Close()

	meta := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer fake-media-token" {
			t.Error("wrong connection credential")
		}

		if r.URL.Path == "/v26.0/media-test" {
			write(w, 200, store.Object{"id": "media-test", "url": download.URL})
			return
		}

		if r.URL.Path == "/v26.0/123000/media" {
			uploads++

			file, header, err := r.FormFile("file")
			if err != nil {
				t.Error(err)
				w.WriteHeader(400)

				return
			}
			defer file.Close()

			data, _ := io.ReadAll(file)
			if string(data) != "%PDF-fake" || header.Header.Get("Content-Type") != "application/pdf" || r.FormValue("messaging_product") != "whatsapp" {
				t.Error("incorrect multipart upload")
			}

			write(w, 200, store.Object{"id": "media-test"})

			return
		}

		sends++

		var payload store.Object

		json.NewDecoder(r.Body).Decode(&payload)

		if str(payload, "to") != "15550000001" {
			t.Error("conversation recipient could be overridden")
		}

		write(w, 200, store.Object{"messages": []any{store.Object{"id": store.ID("wamid")}}})
	}))

	defer meta.Close()

	s.Meta.BaseURL, s.Meta.Version, s.Config.MetaVersion = meta.URL, "v26.0", "v26.0"

	var body bytes.Buffer

	form := multipart.NewWriter(&body)
	header := textproto.MIMEHeader{"Content-Disposition": {`form-data; name="file"; filename="test.pdf"`}, "Content-Type": {"application/pdf"}}
	part, _ := form.CreatePart(header)
	part.Write([]byte("%PDF-fake"))
	form.Close()

	req, _ := http.NewRequest("POST", h.URL+"/v1/connections/"+con+"/media", &body)
	req.Header.Set("Content-Type", form.FormDataContentType())
	req.Header.Set("X-API-Key", key)

	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()

	if res.StatusCode != 201 || uploads != 1 || sends != 0 {
		t.Fatalf("upload did not succeed independently: %d", res.StatusCode)
	}

	req, _ = http.NewRequest("GET", h.URL+"/v1/connections/"+con+"/media/media-test", nil)
	req.Header.Set("X-API-Key", key)

	downloadResponse, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}

	downloadBytes, _ := io.ReadAll(downloadResponse.Body)
	downloadResponse.Body.Close()

	if downloadResponse.StatusCode != 200 || string(downloadBytes) != "%PDF-fake" || downloadResponse.Header.Get("Cache-Control") != "no-store" {
		t.Fatal("authenticated attachment download failed")
	}

	path := "/v1/conversations/" + chat + "/messages"
	input := store.Object{"payload": store.Object{"type": "document", "to": "different-recipient", "document": store.Object{"id": "media-test", "filename": "test.pdf", "caption": "Attached"}}}
	status, out := request(t, h.URL, key, "POST", path, input, "media-reply")
	expect(t, status, 201, out)
	status, out = request(t, h.URL, key, "POST", path, input, "media-reply")
	expect(t, status, 201, out)

	if sends != 1 {
		t.Fatal("idempotent attachment reply sent twice")
	}

	bad := store.Object{"payload": store.Object{"type": "image", "image": store.Object{"id": "foreign-media"}}}
	status, out = request(t, h.URL, key, "POST", path, bad, "foreign-media")
	expect(t, status, 422, out)

	button := store.Object{"payload": store.Object{"type": "interactive", "interactive": store.Object{"type": "button", "body": store.Object{"text": "Choose"}, "action": store.Object{"buttons": []any{store.Object{"type": "reply", "reply": store.Object{"id": "yes", "title": "Yes"}}}}}}}
	status, out = request(t, h.URL, key, "POST", path, button, "interactive-reply")
	expect(t, status, 201, out)

	if sends != 2 {
		t.Fatal("interactive message did not reach fake provider")
	}

	if _, err = s.Store.Patch(ctx, p, "conversations", chat, store.Object{"service_window_expires_at": time.Now().Add(-time.Hour).Format(time.RFC3339Nano)}); err != nil {
		t.Fatal(err)
	}

	status, out = request(t, h.URL, key, "POST", path, button, "outside-window-interactive")
	expect(t, status, 409, out)

	if sends != 2 {
		t.Fatal("interactive message bypassed service window")
	}

	_, _, _, otherKey := fixture(t)
	status, out = request(t, h.URL, otherKey, "GET", "/v1/connections/"+con+"/media/media-test", nil, "")
	expect(t, status, 404, out)
}

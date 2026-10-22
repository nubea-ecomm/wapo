package api

import (
	"encoding/json"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"path/filepath"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

func mediaKind(contentType string) (string, int64) {
	switch contentType {
	case "image/jpeg", "image/png":
		return "image", 5 << 20
	case "audio/aac", "audio/amr", "audio/mpeg", "audio/mp4", "audio/ogg":
		return "audio", 16 << 20
	case "video/mp4", "video/3gpp":
		return "video", 16 << 20
	case "text/plain", "application/pdf", "application/msword", "application/vnd.ms-excel", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.presentationml.presentation":
		return "document", 100 << 20
	}

	return "", 0
}

func (s *Server) connectionMedia(w http.ResponseWriter, r *http.Request, connection, mediaID string) {
	controller := http.NewResponseController(w)
	_ = controller.SetReadDeadline(time.Now().Add(90 * time.Second))
	_ = controller.SetWriteDeadline(time.Now().Add(3 * time.Minute))

	c, err := s.Store.Get(r.Context(), project(r), "connections", connection)
	if err != nil {
		dbError(w, err)
		return
	}

	if str(c, "channel") != "whatsapp" || !s.Config.ChannelEnabled("whatsapp") {
		fail(w, 422, "unsupported_channel", "WhatsApp is required")
		return
	}

	if mediaID != "" && r.Method == "GET" {
		s.readConnectionMedia(w, r, c, mediaID)
		return
	}

	if mediaID != "" || r.Method != "POST" {
		fail(w, 405, "method_not_allowed", "Use POST to upload or GET with a media ID")
		return
	}

	if str(c, "status") != "connected" {
		fail(w, 409, "connection_not_ready", "Connection has not completed onboarding")
		return
	}

	if err = r.ParseMultipartForm(1 << 20); err != nil {
		fail(w, 413, "invalid_upload", "Upload exceeds 100 MB or multipart data is invalid")
		return
	}

	defer r.MultipartForm.RemoveAll()

	file, header, err := r.FormFile("file")
	if err != nil {
		fail(w, 422, "validation_error", "file is required")
		return
	}
	defer file.Close()

	contentType, _, _ := mime.ParseMediaType(header.Header.Get("Content-Type"))
	if contentType == "audio/x-m4a" || contentType == "audio/m4a" {
		contentType = "audio/mp4"
	}

	if contentType == "audio/mp3" {
		contentType = "audio/mpeg"
	}

	name := filepath.Base(strings.ReplaceAll(header.Filename, "\\", "/"))
	kind, limit := mediaKind(contentType)

	var source io.Reader = file

	voice := r.FormValue("voice") == "true"

	if voice {
		if header.Size > 16<<20 || !strings.HasPrefix(contentType, "audio/") {
			fail(w, 422, "invalid_audio", "Recording must be audio under 16 MB")
			return
		}

		converted, e := transcodeVoice(r.Context(), file)
		if e != nil {
			fail(w, 422, "audio_conversion_failed", "Could not convert recording to OGG/Opus; check audio and ffmpeg installation")
			return
		}
		defer converted.Close()
		defer removeVoiceFile(converted)

		source = converted
		contentType, name, kind, limit = "audio/ogg", "voice.ogg", "audio", 16<<20
	}

	if kind == "" || header.Size == 0 || header.Size > limit {
		fail(w, 422, "unsupported_media", "Unsupported media type or file exceeds its size limit")
		return
	}

	token, err := s.Store.Unseal(str(c, "access_token"), project(r))
	if err != nil {
		fail(w, 500, "credential_error", "Cannot read connection credentials")
		return
	}

	reader, writer := io.Pipe()

	defer reader.Close()

	form := multipart.NewWriter(writer)
	finished := make(chan struct{})

	go func() {
		defer close(finished)

		e := form.WriteField("messaging_product", "whatsapp")
		if e == nil {
			e = form.WriteField("type", contentType)
		}

		if e == nil {
			h := textproto.MIMEHeader{}
			h.Set("Content-Disposition", mime.FormatMediaType("form-data", map[string]string{"name": "file", "filename": name}))
			h.Set("Content-Type", contentType)
			part, partErr := form.CreatePart(h)

			e = partErr
			if e == nil {
				_, e = io.Copy(part, source)
			}
		}

		if e == nil {
			e = form.Close()
		}

		writer.CloseWithError(e)
	}()

	defer func() { reader.Close(); <-finished }()

	req, err := http.NewRequestWithContext(r.Context(), "POST", s.Meta.BaseURL+"/"+s.Config.MetaVersion+"/"+url.PathEscape(str(c, "external_id"))+"/media", reader)
	if err != nil {
		fail(w, 500, "invalid_provider_url", "Invalid provider URL")
		return
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", form.FormDataContentType())

	client := s.HTTP
	if s.Meta.Client != nil {
		client = s.Meta.Client
	}

	uploadClient := *client
	uploadClient.Timeout = 60 * time.Second

	res, err := uploadClient.Do(req)
	if err != nil {
		fail(w, 502, "provider_unavailable", "Media upload failed")
		return
	}
	defer res.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil || !json.Valid(raw) {
		fail(w, 502, "provider_error", "Invalid media upload response")
		return
	}

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		rawJSON(w, res.StatusCode, raw)
		return
	}

	var result store.Object

	json.Unmarshal(raw, &result)

	if str(result, "id") == "" {
		fail(w, 502, "provider_error", "Media ID missing")
		return
	}

	if err = s.rememberMetaAsset(r, c, "media", str(result, "id")); err != nil {
		dbError(w, err)
		return
	}

	write(w, 201, store.Object{"data": store.Object{"id": result["id"], "type": kind, "mime_type": contentType, "filename": name, "voice": voice}})
}

func (s *Server) readConnectionMedia(w http.ResponseWriter, r *http.Request, c store.Object, id string) {
	bound, err := s.boundMetaAsset(r, id, "media")
	if err != nil || str(bound, "id") != str(c, "id") {
		fail(w, 404, "not_found", "Media not found on this connection")
		return
	}

	token, err := s.Store.Unseal(str(c, "access_token"), project(r))
	if err != nil {
		fail(w, 500, "credential_error", "Cannot read connection credentials")
		return
	}

	status, raw, err := s.Meta.Call(r.Context(), "GET", s.Config.MetaVersion+"/"+url.PathEscape(id), token, nil, url.Values{"phone_number_id": {str(c, "external_id")}}.Encode())

	var data store.Object

	if err != nil || status != 200 || json.Unmarshal(raw, &data) != nil || str(data, "url") == "" {
		fail(w, 502, "media_unavailable", "Media is unavailable or expired at Meta")
		return
	}

	capability, _ := url.Parse(s.mediaDownloadLink(r, str(data, "url"), str(c, "id")))
	copyRequest := r.Clone(r.Context())
	copyURL := *r.URL
	copyURL.RawQuery = capability.RawQuery
	copyRequest.URL = &copyURL
	s.downloadMetaMedia(w, copyRequest)
}

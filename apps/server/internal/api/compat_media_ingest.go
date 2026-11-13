package api

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

// Meta's template header media types and their size limits.
var templateHeaderMediaLimits = map[string]int64{
	"image/jpeg":      5 << 20,
	"image/png":       5 << 20,
	"video/mp4":       16 << 20,
	"video/3gpp":      16 << 20,
	"application/pdf": 100 << 20,
}

// compatMediaIngest implements `POST /platform/v1/whatsapp/media` for
// `delivery: meta_resumable_asset`: fetch a public URL and return the Meta
// resumable-upload handle used as a template header example.
func (s *Server) compatMediaIngest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		fail(w, 405, "method_not_allowed", "Use POST")
		return
	}

	o, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON object required")
		return
	}

	in := object(o, "media_ingest")

	switch str(in, "delivery") {
	case "meta_resumable_asset":
	case "meta_media":
		fail(w, 501, "media_delivery_not_implemented", "delivery meta_media is not implemented; upload the file through /meta/whatsapp/{version}/{phone_number_id}/media")
		return
	default:
		fail(w, 422, "validation_error", "media_ingest.delivery must be meta_resumable_asset")
		return
	}

	phoneID, source := str(in, "phone_number_id"), str(in, "source")
	mimeType := strings.ToLower(strings.TrimSpace(str(in, "mime_type")))
	limit, supported := templateHeaderMediaLimits[mimeType]

	if phoneID == "" || source == "" {
		fail(w, 422, "validation_error", "media_ingest.phone_number_id and media_ingest.source are required")
		return
	}

	if !supported {
		fail(w, 422, "unsupported_media_type", "media_ingest.mime_type must be image/jpeg, image/png, video/mp4, video/3gpp or application/pdf")
		return
	}

	c, e := s.phoneConnection(r, phoneID)
	if e != nil {
		dbError(w, e)
		return
	}

	if s.Config.MetaAppID == "" {
		fail(w, 503, "meta_app_not_configured", "META_APP_ID is required for resumable media uploads")
		return
	}

	token, e := s.Store.Unseal(str(c, "access_token"), project(r))
	if e != nil || token == "" {
		fail(w, 500, "credential_error", "Cannot read connection credentials")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 170*time.Second)
	defer cancel()

	media, e := newMediaSource(s.Config.AllowPrivateWebhooks).fetch(ctx, source, limit)
	if e != nil {
		s.failMediaSource(w, r, phoneID, e)
		return
	}
	defer media.Close()

	if !mediaMatchesType(mimeType, media.head) {
		fail(w, 422, "media_type_mismatch", "The downloaded file is not a valid "+mimeType)
		return
	}

	handle, e := s.uploadResumable(ctx, token, ingestFilename(str(in, "filename"), source), mimeType, media)
	if e != nil {
		var metaErr *metaUploadError

		slog.Warn("media ingest upload failed", "project", project(r), "phone_number_id", phoneID, "error_type", errorType(e))

		if errors.As(e, &metaErr) {
			fail(w, 502, "meta_upload_failed", metaErr.Error())
		} else {
			fail(w, 502, "provider_unavailable", "Meta resumable upload request failed")
		}

		return
	}

	write(w, 200, store.Object{"data": store.Object{"target": store.Object{"kind": "meta_resumable_asset", "handle": handle}}})
}

// failMediaSource never echoes the source URL: signed bucket URLs carry
// credentials in their query string.
func (s *Server) failMediaSource(w http.ResponseWriter, r *http.Request, phoneID string, e error) {
	slog.Warn("media ingest download failed", "project", project(r), "phone_number_id", phoneID, "error_type", errorType(e))

	switch {
	case errors.Is(e, errSourceURL):
		fail(w, 422, "invalid_source_url", errSourceURL.Error())
	case errors.Is(e, errSourceDenied):
		fail(w, 422, "source_not_allowed", "media_ingest.source must resolve to a public address")
	case errors.Is(e, errSourceRedirects):
		fail(w, 422, "source_redirect_limit", errSourceRedirects.Error())
	case errors.Is(e, errSourceTooLarge):
		fail(w, 413, "media_too_large", "The file exceeds Meta's size limit for this media type")
	case errors.Is(e, errSourceEmpty):
		fail(w, 422, "source_empty", errSourceEmpty.Error())
	case errors.Is(e, errSourceStatus):
		fail(w, 422, "source_unavailable", e.Error())
	case isTimeout(e):
		fail(w, 504, "source_timeout", "The source download did not finish in time")
	default:
		fail(w, 502, "source_fetch_failed", "The source could not be downloaded")
	}
}

func isTimeout(e error) bool {
	var ne net.Error

	return errors.Is(e, context.DeadlineExceeded) || (errors.As(e, &ne) && ne.Timeout())
}

func errorType(e error) string {
	for _, known := range []error{errSourceURL, errSourceDenied, errSourceRedirects, errSourceTooLarge, errSourceEmpty, errSourceStatus} {
		if errors.Is(e, known) {
			return known.Error()
		}
	}

	var metaErr *metaUploadError

	if errors.As(e, &metaErr) {
		return "meta_upload_failed"
	}

	if isTimeout(e) {
		return "timeout"
	}

	return "transport"
}

// mediaMatchesType checks magic bytes so an HTML error page served with a
// 200 is not uploaded to Meta as a template sample.
func mediaMatchesType(mimeType string, head []byte) bool {
	switch mimeType {
	case "video/mp4", "video/3gpp":
		// Both are ISO base media files: a box size followed by `ftyp`.
		return len(head) >= 8 && bytes.Equal(head[4:8], []byte("ftyp"))
	default:
		return http.DetectContentType(head) == mimeType
	}
}

func ingestFilename(name, source string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		if u, e := url.Parse(source); e == nil {
			name = path.Base(u.Path)
		}
	}

	if name == "" || name == "." || name == "/" {
		name = "upload"
	}

	if len(name) > 255 {
		name = name[:255]
	}

	return name
}

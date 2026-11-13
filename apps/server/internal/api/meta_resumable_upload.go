package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

// metaUploadError carries Meta's own explanation with credentials removed, so
// a caller can tell an unsupported file from an unauthorized app.
type metaUploadError struct {
	Status  int
	Message string
}

func (e *metaUploadError) Error() string {
	return fmt.Sprintf("Meta resumable upload failed (HTTP %d): %s", e.Status, e.Message)
}

// uploadResumable runs Meta's two-step Resumable Upload API and returns the
// file handle (`h`) that template creation accepts as a media header example.
// It is app-scoped: the session is opened on the instance's Meta app ID with
// the connection's own token.
func (s *Server) uploadResumable(ctx context.Context, token, filename, mimeType string, media *fetchedMedia) (string, error) {
	q := url.Values{"file_name": {filename}, "file_length": {strconv.FormatInt(media.size, 10)}, "file_type": {mimeType}}

	session, e := s.metaUploadCall(ctx, token, url.PathEscape(s.Config.MetaAppID)+"/uploads?"+q.Encode(), nil, 0)
	if e != nil {
		return "", e
	}

	id := str(session, "id")
	if !strings.HasPrefix(id, "upload:") || strings.Contains(id, "..") || strings.ContainsAny(id, " #\\\r\n\t") {
		return "", &metaUploadError{502, "Meta did not return an upload session"}
	}

	// The session ID is used verbatim: Meta appends its signature as a query
	// string (`upload:…?sig=…`) and expects it back unchanged.
	result, e := s.metaUploadCall(ctx, token, id, media.file, media.size)
	if e != nil {
		return "", e
	}

	handle := str(result, "h")
	if handle == "" {
		return "", &metaUploadError{502, "Meta did not return a file handle"}
	}

	return handle, nil
}

func (s *Server) metaUploadCall(ctx context.Context, token, path string, body io.Reader, size int64) (store.Object, error) {
	base, e := url.Parse(s.Meta.BaseURL)
	if e != nil {
		return nil, e
	}

	target, e := url.Parse(strings.TrimRight(s.Meta.BaseURL, "/") + "/" + s.Config.MetaVersion + "/" + path)
	if e != nil || target.Host != base.Host || target.Scheme != base.Scheme {
		return nil, &metaUploadError{502, "Meta returned an unusable upload session"}
	}

	if body == nil {
		body = http.NoBody
	}

	req, e := http.NewRequestWithContext(ctx, http.MethodPost, target.String(), body)
	if e != nil {
		return nil, e
	}

	req.ContentLength = size
	// Meta documents the OAuth scheme for resumable uploads.
	req.Header.Set("Authorization", "OAuth "+token)

	if size > 0 {
		req.Header.Set("file_offset", "0")
	}

	client := *s.HTTP
	if s.Meta.Client != nil {
		client = *s.Meta.Client
	}

	client.Timeout = 90 * time.Second

	res, e := client.Do(req)
	if e != nil {
		return nil, e
	}
	defer res.Body.Close()

	raw, e := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if e != nil {
		return nil, e
	}

	var o store.Object

	if json.Unmarshal(raw, &o) != nil {
		return nil, &metaUploadError{res.StatusCode, "Invalid Meta response"}
	}

	if res.StatusCode < 200 || res.StatusCode >= 300 {
		message := str(object(o, "error"), "message")

		for _, secret := range []string{token, s.Config.MetaAppSecret} {
			if secret != "" {
				message = strings.ReplaceAll(message, secret, "[redacted]")
			}
		}

		if len(message) > 300 {
			message = message[:300]
		}

		if message == "" {
			message = "No error description"
		}

		return nil, &metaUploadError{res.StatusCode, message}
	}

	return o, nil
}

package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"syscall"
	"time"

	"wapo.local/server/internal/delivery"
)

// Media ingest downloads a URL chosen by an API caller, which makes it a
// server-side request forgery surface. These errors let the handler answer
// precisely without echoing the URL (signed bucket URLs carry credentials).
var (
	errSourceURL       = errors.New("source URL must be an HTTPS address on the default port")
	errSourceDenied    = errors.New("source resolves to a non-public address")
	errSourceRedirects = errors.New("source redirected too many times")
	errSourceTooLarge  = errors.New("source exceeds the size limit")
	errSourceEmpty     = errors.New("source returned an empty body")
	errSourceStatus    = errors.New("source did not answer HTTP 200")
)

type mediaSource struct {
	// allowHTTP permits plain HTTP and any port. Only local development and
	// tests enable it, through ALLOW_PRIVATE_WEBHOOKS.
	allowHTTP    bool
	allowIP      func(net.IP) bool
	timeout      time.Duration
	maxRedirects int
}

// fetchedMedia is spooled to a temporary file: Meta's resumable upload needs
// the exact length before the first byte, and a 100 MB document should not
// sit in memory.
type fetchedMedia struct {
	file *os.File
	size int64
	head []byte
}

func (f *fetchedMedia) Close() {
	f.file.Close()
	os.Remove(f.file.Name())
}

func newMediaSource(allowPrivate bool) mediaSource {
	allow := delivery.PublicIP
	if allowPrivate {
		allow = func(net.IP) bool { return true }
	}

	return mediaSource{allowHTTP: allowPrivate, allowIP: allow, timeout: 90 * time.Second, maxRedirects: 3}
}

func (m mediaSource) checkURL(u *url.URL) error {
	if u == nil || u.Hostname() == "" || u.User != nil {
		return errSourceURL
	}

	if u.Scheme == "https" && (u.Port() == "" || u.Port() == "443") {
		return nil
	}

	if m.allowHTTP && (u.Scheme == "http" || u.Scheme == "https") {
		return nil
	}

	return errSourceURL
}

func (m mediaSource) client() *http.Client {
	// Control runs after DNS resolution, on the address actually being
	// dialed, for the first request and every redirect. Checking the hostname
	// alone would let DNS rebinding swap in a private address.
	dialer := &net.Dialer{Timeout: 5 * time.Second, Control: func(_, address string, _ syscall.RawConn) error {
		host, _, e := net.SplitHostPort(address)
		if ip := net.ParseIP(host); e != nil || ip == nil || !m.allowIP(ip) {
			return errSourceDenied
		}

		return nil
	}}
	transport := &http.Transport{
		Proxy:                  nil,
		DialContext:            dialer.DialContext,
		TLSHandshakeTimeout:    5 * time.Second,
		ResponseHeaderTimeout:  15 * time.Second,
		MaxResponseHeaderBytes: 64 << 10,
		DisableCompression:     true,
	}

	return &http.Client{Transport: transport, Timeout: m.timeout, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) > m.maxRedirects {
			return errSourceRedirects
		}

		return m.checkURL(req.URL)
	}}
}

func (m mediaSource) fetch(ctx context.Context, raw string, limit int64) (*fetchedMedia, error) {
	u, e := url.Parse(raw)
	if e != nil {
		return nil, errSourceURL
	}

	if e = m.checkURL(u); e != nil {
		return nil, e
	}

	req, e := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if e != nil {
		return nil, errSourceURL
	}

	req.Header.Set("User-Agent", "Wapo-Media-Ingest/1")

	client := m.client()
	defer client.CloseIdleConnections()

	res, e := client.Do(req)
	if e != nil {
		return nil, e
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%w (HTTP %d)", errSourceStatus, res.StatusCode)
	}

	if res.ContentLength > limit {
		return nil, errSourceTooLarge
	}

	file, e := os.CreateTemp("", "wapo-ingest-*")
	if e != nil {
		return nil, e
	}

	media := &fetchedMedia{file: file}

	// The declared length can be absent or wrong, so the cap is enforced on
	// the bytes actually read.
	media.size, e = io.Copy(file, io.LimitReader(res.Body, limit+1))
	if e == nil && media.size > limit {
		e = errSourceTooLarge
	} else if e == nil && media.size == 0 {
		e = errSourceEmpty
	}

	if e == nil {
		media.head = make([]byte, min(media.size, 512))
		_, e = file.ReadAt(media.head, 0)
	}

	if e == nil {
		_, e = file.Seek(0, io.SeekStart)
	}

	if e != nil {
		media.Close()
		return nil, e
	}

	return media, nil
}

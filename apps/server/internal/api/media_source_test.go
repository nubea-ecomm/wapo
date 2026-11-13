package api

import (
	"bytes"
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestMediaSourceRejectsNonPublicDestinationsByDialedAddress(t *testing.T) {
	source := newMediaSource(false)
	// Control rejects these before any connection attempt, so no network is used.
	for _, raw := range []string{"https://localhost/a.png", "https://127.0.0.1/a.png", "https://[::1]/a.png", "https://10.0.0.8/a.png", "https://169.254.169.254/latest/meta-data", "https://100.64.0.1/a.png", "https://[fd00:ec2::254]/a.png", "https://[::ffff:127.0.0.1]/a.png"} {
		_, e := source.fetch(context.Background(), raw, 1<<20)
		if !errors.Is(e, errSourceDenied) {
			t.Errorf("%s: got %v, want a denied destination", raw, e)
		}
	}

	for _, raw := range []string{"http://example.com/a.png", "https://example.com:8443/a.png", "ftp://example.com/a.png", "https://user:pass@example.com/a.png", "/relative.png", "https:///a.png"} {
		if _, e := source.fetch(context.Background(), raw, 1<<20); !errors.Is(e, errSourceURL) {
			t.Errorf("%s: got %v, want an invalid URL", raw, e)
		}
	}
}

func TestMediaSourceRechecksEveryRedirectHop(t *testing.T) {
	listener, e := net.Listen("tcp", "127.0.0.2:0")
	if e != nil {
		t.Skip("second loopback address unavailable:", e)
	}

	private := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		t.Error("redirect target must not be reached")
	}))
	private.Listener = listener
	private.Start()

	defer private.Close()

	public := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, private.URL+"/secret", http.StatusFound)
	}))
	defer public.Close()

	// 127.0.0.1 stands in for a public host; 127.0.0.2 for a private one.
	source := mediaSource{allowHTTP: true, allowIP: func(ip net.IP) bool { return ip.Equal(net.ParseIP("127.0.0.1")) }, timeout: 5 * time.Second, maxRedirects: 3}
	if _, e := source.fetch(context.Background(), public.URL+"/a.png", 1<<20); !errors.Is(e, errSourceDenied) {
		t.Fatalf("redirect to a denied address: got %v", e)
	}
}

func TestMediaSourceCapsRedirectsAndRejectsDowngrades(t *testing.T) {
	hops := 0
	loop := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hops++

		http.Redirect(w, r, "/again", http.StatusFound)
	}))

	defer loop.Close()

	source := newMediaSource(true)
	if _, e := source.fetch(context.Background(), loop.URL, 1<<20); !errors.Is(e, errSourceRedirects) || hops != 4 {
		t.Fatalf("redirect loop: got %v after %d requests", e, hops)
	}

	strict := newMediaSource(false)

	for _, raw := range []string{"http://cdn.example/a.png", "https://cdn.example:8443/a.png"} {
		u, _ := url.Parse(raw)
		if strict.checkURL(u) == nil {
			t.Errorf("redirect target %s must be refused", raw)
		}
	}
}

func TestMediaSourceEnforcesTheCapWhileStreaming(t *testing.T) {
	body := bytes.Repeat([]byte{'x'}, 2048)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/chunked" {
			// Flushing before writing forces chunked encoding: no declared length.
			w.(http.Flusher).Flush()
		}

		w.Write(body)
	}))

	defer server.Close()

	source := newMediaSource(true)

	for _, path := range []string{"/declared", "/chunked"} {
		if _, e := source.fetch(context.Background(), server.URL+path, 1024); !errors.Is(e, errSourceTooLarge) {
			t.Errorf("%s: got %v, want the size cap", path, e)
		}
	}

	media, e := source.fetch(context.Background(), server.URL+"/chunked", 2048)
	if e != nil {
		t.Fatal(e)
	}

	defer media.Close()

	if media.size != 2048 || len(media.head) != 512 {
		t.Fatalf("size=%d head=%d", media.size, len(media.head))
	}
}

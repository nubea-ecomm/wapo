package api

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"wapo.local/server/internal/channel"
	"wapo.local/server/internal/config"
	"wapo.local/server/internal/store"
)

type contextKey string

type Server struct {
	Store  *store.Store
	Config config.Config
	Meta   channel.WhatsApp
	HTTP   *http.Client
}

func New(s *store.Store, c config.Config) *Server {
	return &Server{Store: s, Config: c, Meta: channel.WhatsApp{BaseURL: c.MetaURL, Version: c.MetaVersion}, HTTP: &http.Client{Timeout: 25 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}}
}
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /auth/v1/me", s.consoleProfile)
	mux.HandleFunc("POST /auth/v1/login", s.login)
	mux.HandleFunc("POST /auth/v1/logout", s.logout)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { write(w, 200, store.Object{"status": "ok"}) })
	mux.HandleFunc("GET /readyz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), time.Second)
		defer cancel()
		if s.Store.Pool.Ping(ctx) != nil {
			fail(w, 503, "not_ready", "Database unavailable")
			return
		}
		write(w, 200, store.Object{"status": "ready"})
	})
	mux.HandleFunc("GET /openapi.json", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "../../packages/openapi/openapi.json")
	})
	mux.HandleFunc("GET /docs", s.docsPage)
	mux.HandleFunc("GET /docs/{$}", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/docs", http.StatusTemporaryRedirect)
	})
	mux.HandleFunc("GET /docs/assets/{name}", s.docsAsset)
	mux.HandleFunc("GET /public/projects/{project}/logo/{hash}", s.projectLogo)
	mux.HandleFunc("GET /setup/assets/{name}", s.setupAsset)
	mux.HandleFunc("GET /setup/{project}/{token}", s.setupPage)
	mux.HandleFunc("GET /public/setup/{project}/{token}", s.publicSetup)
	mux.HandleFunc("POST /public/setup/{project}/{token}/complete", s.completeSetup)
	mux.HandleFunc("GET /hooks/meta/{project}", s.verifyMeta)
	mux.HandleFunc("POST /hooks/meta/{project}", s.receiveMeta)
	mux.Handle("/admin/v1/", s.adminAuth(http.HandlerFunc(s.admin)))
	mux.Handle("/v1/", s.auth(http.HandlerFunc(s.native)))
	mux.Handle("/platform/v1/", s.auth(http.HandlerFunc(s.compatPlatform)))
	mux.Handle("/meta/whatsapp/", s.auth(http.HandlerFunc(s.compatMeta)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				slog.Error("request panic", "request_id", w.Header().Get("X-Request-ID"))
				fail(w, 500, "internal_error", "Unexpected server error")
			}
		}()
		w.Header().Set("X-Request-ID", store.ID("req"))
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if origin := r.Header.Get("Origin"); s.Config.AllowsOrigin(origin) || s.setupRequestOrigin(r, origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization, Idempotency-Key, X-Tenant-ID")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID, Retry-After")
		}
		if r.Method == "OPTIONS" {
			w.WriteHeader(204)
			return
		}
		limit := int64(2 << 20)
		if strings.HasPrefix(r.URL.Path, "/meta/whatsapp/") && (strings.HasSuffix(r.URL.Path, "/media") || strings.HasSuffix(r.URL.Path, "/assets")) {
			limit = 100 << 20
		}
		if r.URL.Path == "/v1/project" {
			limit = 8 << 20
		}
		r.Body = http.MaxBytesReader(w, r.Body, limit)
		mux.ServeHTTP(w, r)
	})
}

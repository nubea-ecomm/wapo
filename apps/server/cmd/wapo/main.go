package main

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"wapo.local/server/internal/api"
	"wapo.local/server/internal/channel"
	"wapo.local/server/internal/config"
	"wapo.local/server/internal/delivery"
	"wapo.local/server/internal/notification"
	"wapo.local/server/internal/store"
	"wapo.local/server/internal/templatesync"
)

func main() {
	if e := run(); e != nil {
		slog.Error("wapo stopped", "error", e)
		os.Exit(1)
	}
}

func run() error {
	if len(os.Args) > 1 && os.Args[1] == "secrets" {
		b := make([]byte, 32)
		if _, e := rand.Read(b); e != nil {
			return e
		}

		fmt.Println("BOOTSTRAP_API_KEY=wapo_" + base64.RawURLEncoding.EncodeToString(b))

		if _, e := rand.Read(b); e != nil {
			return e
		}

		fmt.Println("ENCRYPTION_KEY=" + base64.StdEncoding.EncodeToString(b))

		return nil
	}

	c, e := config.Load()
	if e != nil {
		return e
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)

	defer stop()

	connectCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	s, e := store.Open(connectCtx, c.DatabaseURL, c.EncryptionKey, store.Options{MaxConns: c.DBMaxConns, MinConns: c.DBMinConns, AuthCacheTTL: c.AuthCacheTTL, AuthCacheEntries: c.AuthCacheEntries})

	cancel()

	if e != nil {
		return e
	}

	defer s.Pool.Close()

	if len(os.Args) > 1 && os.Args[1] == "migrate" {
		return s.Migrate(ctx, config.Env("MIGRATIONS_FILE", "migrations/001_initial.sql"))
	}

	if len(os.Args) > 1 && os.Args[1] == "rotate-encryption-key" {
		encoded := os.Getenv("NEW_ENCRYPTION_KEY")
		key, decodeErr := base64.StdEncoding.DecodeString(encoded)

		if decodeErr != nil || len(key) != 32 {
			return fmt.Errorf("NEW_ENCRYPTION_KEY must be a base64-encoded 32-byte key")
		}

		count, rotateErr := s.RotateEncryptionKey(ctx, key)
		if rotateErr != nil {
			return rotateErr
		}

		slog.Info("credential encryption key rotated", "resources", count)

		return nil
	}

	if len(os.Args) > 1 && os.Args[1] == "operations" {
		stats, statsErr := s.OperationalStats(ctx)
		if statsErr != nil {
			return statsErr
		}

		return json.NewEncoder(os.Stdout).Encode(stats)
	}

	if c.APIKey != "" {
		if e = s.Bootstrap(ctx, c.ProjectID, c.APIKey); e != nil {
			return e
		}
	}

	if len(os.Args) > 1 && os.Args[1] == "bootstrap" {
		if c.APIKey == "" {
			return fmt.Errorf("BOOTSTRAP_API_KEY is required")
		}

		slog.Info("project and API key registered", "project", c.ProjectID)

		return nil
	}

	if c.AdminEmail != "" && c.AdminPassword != "" && !(len(os.Args) > 1 && os.Args[1] == "worker") {
		if e = s.BootstrapUser(ctx, c.AdminEmail, c.AdminPassword); e != nil {
			return e
		}
	}

	if len(os.Args) > 1 && os.Args[1] == "worker" {
		go templatesync.Run(ctx, s, channel.WhatsApp{BaseURL: c.MetaURL, Version: c.MetaVersion})
		go api.New(s, c).RunConnectionHealth(ctx)
		go s.RunMaintenance(ctx)

		var emailSender notification.Sender

		if c.SMTPHost != "" {
			emailSender = notification.SMTPSender{Config: notification.SMTPConfig{Host: c.SMTPHost, Port: c.SMTPPort, Username: c.SMTPUsername, Password: c.SMTPPassword, FromAddress: c.SMTPFromAddress, FromName: c.SMTPFromName, TLS: c.SMTPTLS}}
		}

		go notification.Run(ctx, s, emailSender, strings.TrimSpace(strings.Split(c.WebOrigin, ",")[0]))

		delivery.Run(ctx, s, c.AllowPrivateWebhooks)

		return nil
	}

	apiServer := api.New(s, c)
	defer apiServer.Close()

	srv := &http.Server{Addr: c.Addr, Handler: apiServer.Handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 40 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10}
	done := make(chan error, 1)

	go func() { done <- srv.ListenAndServe() }()

	slog.Info("API listening", "address", c.Addr)

	select {
	case e := <-done:
		if e != http.ErrServerClosed {
			return e
		}

		return nil
	case <-ctx.Done():
		shutdown, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		return srv.Shutdown(shutdown)
	}
}

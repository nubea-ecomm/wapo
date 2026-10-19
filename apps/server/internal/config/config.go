package config

import (
	"encoding/base64"
	"fmt"
	"math"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Channels                                                       []string
	Addr, DatabaseURL, APIKey, ProjectID, PublicURL, WebOrigin     string
	EncryptionKey                                                  []byte
	BridgeKey, BridgeProject, BridgePlatformURL, BridgeWhatsAppURL string
	MetaURL, MetaVersion, MetaAppSecret, MetaVerifyToken           string
	AllowPrivateWebhooks                                           bool
	AdminEmail, AdminPassword                                      string
	AdminKey                                                       string
	MetaAppID, MetaConfigID                                        string
	PublicRateLimit, LoginRateLimit                                int
	DBMaxConns, DBMinConns                                         int32
	AuthCacheTTL                                                   time.Duration
	AuthCacheEntries                                               int
	RequestLogSampleRate                                           float64
}

func Env(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}

	return fallback
}

func Load() (Config, error) {
	c := Config{Addr: Env("HTTP_ADDR", ":8080"), DatabaseURL: os.Getenv("DATABASE_URL"), APIKey: os.Getenv("BOOTSTRAP_API_KEY"), ProjectID: Env("BOOTSTRAP_PROJECT_ID", "default"), PublicURL: Env("PUBLIC_URL", "http://localhost:8080"), WebOrigin: Env("WEB_ORIGIN", "http://localhost:5173"), BridgeKey: os.Getenv("UPSTREAM_API_KEY"), BridgeProject: Env("UPSTREAM_BRIDGE_PROJECT_ID", "default"), BridgePlatformURL: Env("UPSTREAM_PLATFORM_URL", "https://example.invalid/platform/v1"), BridgeWhatsAppURL: Env("UPSTREAM_WHATSAPP_URL", "https://example.invalid/meta/whatsapp"), MetaURL: Env("META_BASE_URL", "https://graph.facebook.com"), MetaVersion: Env("META_GRAPH_VERSION", "v24.0"), MetaAppSecret: os.Getenv("META_APP_SECRET"), MetaVerifyToken: os.Getenv("META_VERIFY_TOKEN"), AllowPrivateWebhooks: os.Getenv("ALLOW_PRIVATE_WEBHOOKS") == "true"}
	c.AdminEmail = os.Getenv("ADMIN_EMAIL")
	c.AdminPassword = os.Getenv("ADMIN_PASSWORD")
	c.AdminKey = os.Getenv("ADMIN_API_KEY")
	c.MetaAppID = os.Getenv("META_APP_ID")
	c.MetaConfigID = os.Getenv("META_EMBEDDED_SIGNUP_CONFIG_ID")

	var err error

	if c.PublicRateLimit, err = envInt("PUBLIC_RATE_LIMIT_PER_MINUTE", 0); err != nil || c.PublicRateLimit < 0 {
		return c, fmt.Errorf("PUBLIC_RATE_LIMIT_PER_MINUTE must be a non-negative integer")
	}

	if c.LoginRateLimit, err = envInt("LOGIN_RATE_LIMIT_PER_MINUTE", 10); err != nil || c.LoginRateLimit < 1 {
		return c, fmt.Errorf("LOGIN_RATE_LIMIT_PER_MINUTE must be a positive integer")
	}

	if c.AuthCacheEntries, err = envInt("AUTH_CACHE_ENTRIES", 100000); err != nil || c.AuthCacheEntries < 0 {
		return c, fmt.Errorf("AUTH_CACHE_ENTRIES must be a non-negative integer")
	}

	if c.AuthCacheTTL, err = time.ParseDuration(Env("AUTH_CACHE_TTL", "5s")); err != nil || c.AuthCacheTTL < 0 {
		return c, fmt.Errorf("AUTH_CACHE_TTL must be a non-negative duration")
	}

	if c.RequestLogSampleRate, err = strconv.ParseFloat(Env("REQUEST_LOG_SAMPLE_RATE", "0.01"), 64); err != nil || math.IsNaN(c.RequestLogSampleRate) || c.RequestLogSampleRate < 0 || c.RequestLogSampleRate > 1 {
		return c, fmt.Errorf("REQUEST_LOG_SAMPLE_RATE must be between 0 and 1")
	}

	maxConns, maxErr := envInt("DB_MAX_CONNS", 40)
	minConns, minErr := envInt("DB_MIN_CONNS", 4)

	if maxErr != nil || minErr != nil || maxConns < 1 || minConns < 0 || minConns > maxConns {
		return c, fmt.Errorf("DB_MAX_CONNS and DB_MIN_CONNS must define a valid non-negative pool range")
	}

	c.DBMaxConns, c.DBMinConns = int32(maxConns), int32(minConns)

	c.EncryptionKey, err = base64.StdEncoding.DecodeString(os.Getenv("ENCRYPTION_KEY"))

	if err != nil || len(c.EncryptionKey) != 32 {
		return c, fmt.Errorf("ENCRYPTION_KEY must be 32 random bytes encoded as base64")
	}

	if c.AdminKey != "" && len(c.AdminKey) < 32 {
		return c, fmt.Errorf("ADMIN_API_KEY must contain at least 32 characters")
	}

	if c.AdminKey != "" && c.AdminKey == c.APIKey {
		return c, fmt.Errorf("ADMIN_API_KEY must differ from the project API key")
	}

	if c.DatabaseURL == "" {
		return c, fmt.Errorf("DATABASE_URL is required")
	}

	if c.APIKey != "" && len(c.APIKey) < 32 {
		return c, fmt.Errorf("BOOTSTRAP_API_KEY must contain at least 32 characters")
	}

	for _, raw := range []string{c.PublicURL, c.MetaURL, c.BridgePlatformURL, c.BridgeWhatsAppURL} {
		u, e := url.Parse(raw)
		if e != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
			return c, fmt.Errorf("invalid base URL configuration")
		}
	}

	for _, origin := range strings.Split(c.WebOrigin, ",") {
		u, e := url.Parse(strings.TrimSpace(origin))
		if e != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			return c, fmt.Errorf("WEB_ORIGIN must contain comma-separated HTTP(S) origins without paths")
		}
	}

	c.PublicURL = strings.TrimRight(c.PublicURL, "/")

	return c, nil
}

func envInt(name string, fallback int) (int, error) {
	value := Env(name, strconv.Itoa(fallback))
	return strconv.Atoi(value)
}

// EnabledChannels defines the connectors exposed by this deployment.
// WhatsApp is the sole default. Connector tests explicitly opt into additional channels.
func (c Config) EnabledChannels() []string {
	if len(c.Channels) == 0 {
		return []string{"whatsapp"}
	}

	return c.Channels
}

func (c Config) ChannelEnabled(name string) bool {
	for _, channel := range c.EnabledChannels() {
		if channel == name {
			return true
		}
	}

	return false
}

func (c Config) ChannelFilter() string {
	channels := c.EnabledChannels()
	if len(channels) == 1 {
		return channels[0]
	}

	return ""
}

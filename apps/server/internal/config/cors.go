package config

import (
	"net/url"
	"strings"
)

func loopback(host string) bool { return host == "localhost" || host == "127.0.0.1" || host == "::1" }

const DefaultCORSOrigins = "https://getwapo.dev,https://*.getwapo.dev"

func validCORSOrigin(origin string) bool {
	u, err := url.Parse(origin)
	if err != nil || u.Hostname() == "" || u.User != nil || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || (u.Scheme != "https" && u.Scheme != "http") {
		return false
	}

	host := u.Hostname()
	if strings.Contains(host, "*") {
		return strings.HasPrefix(host, "*.") && !strings.Contains(host[2:], "*") && strings.Contains(host[2:], ".")
	}

	return true
}

// Wildcards match complete subdomain labels, never lookalike suffixes or apex domains.
func (c Config) AllowsOrigin(origin string) bool {
	incoming, e := url.Parse(origin)
	if e != nil || !validCORSOrigin(origin) || strings.Contains(incoming.Host, "*") {
		return false
	}

	extra := c.CORSOrigins
	if extra == "" {
		extra = DefaultCORSOrigins
	}

	for _, raw := range strings.Split(c.WebOrigin+","+extra, ",") {
		allowed := strings.TrimSpace(raw)
		if origin == allowed {
			return true
		}

		u, e := url.Parse(allowed)
		if e == nil && u.Scheme == incoming.Scheme && strings.EqualFold(u.Hostname(), incoming.Hostname()) && originPort(u) == originPort(incoming) {
			return true
		}

		if e == nil && strings.HasPrefix(u.Hostname(), "*.") && u.Scheme == incoming.Scheme && originPort(u) == originPort(incoming) {
			host := strings.ToLower(incoming.Hostname())
			suffix := strings.ToLower(u.Hostname()[1:])

			if strings.HasSuffix(host, suffix) && len(host) > len(suffix) {
				return true
			}
		}

		if e == nil && u.Scheme == "http" && incoming.Scheme == "http" && loopback(u.Hostname()) && loopback(incoming.Hostname()) && u.Port() == incoming.Port() {
			return true
		}
	}

	return false
}

func originPort(u *url.URL) string {
	if port := u.Port(); port != "" {
		return port
	}

	if u.Scheme == "https" {
		return "443"
	}

	return "80"
}

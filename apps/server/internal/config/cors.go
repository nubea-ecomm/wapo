package config

import (
	"net/url"
	"strings"
)

func loopback(host string) bool { return host == "localhost" || host == "127.0.0.1" || host == "::1" }

// Local HTTP aliases share a development server; deployed origins still require an exact match.
func (c Config) AllowsOrigin(origin string) bool {
	incoming, e := url.Parse(origin)
	if e != nil || incoming.Host == "" || incoming.User != nil || incoming.Path != "" || incoming.RawQuery != "" || incoming.Fragment != "" {
		return false
	}
	for _, raw := range strings.Split(c.WebOrigin, ",") {
		allowed := strings.TrimSpace(raw)
		if origin == allowed {
			return true
		}
		u, e := url.Parse(allowed)
		if e == nil && u.Scheme == "http" && incoming.Scheme == "http" && loopback(u.Hostname()) && loopback(incoming.Hostname()) && u.Port() == incoming.Port() {
			return true
		}
	}
	return false
}

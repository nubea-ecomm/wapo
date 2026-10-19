package api

import (
	"net/http"
	"strings"
)

func (s *Server) setupRequestOrigin(r *http.Request, origin string) bool {
	if origin == "" || !strings.HasPrefix(r.URL.Path, "/public/setup/") {
		return false
	}

	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/public/setup/"), "/")
	if len(parts) < 2 || len(parts) > 3 || (len(parts) == 3 && parts[2] != "complete") {
		return false
	}

	copy := r.Clone(r.Context())
	copy.SetPathValue("project", parts[0])
	copy.SetPathValue("token", parts[1])
	link, e := s.lookupSetup(copy)

	return e == nil && s.setupOrigin(link, origin)
}

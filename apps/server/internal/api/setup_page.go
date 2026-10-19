package api

import (
	"embed"
	"html/template"
	"net/http"
	"strconv"
	"strings"

	"wapo.local/server/internal/store"
)

//go:embed setup/*
var setupFiles embed.FS
var setupTemplate = template.Must(template.ParseFS(setupFiles, "setup/page.html"))

func (s *Server) setupPage(w http.ResponseWriter, r *http.Request) {
	link, e := s.lookupSetup(r)
	if e != nil {
		http.Error(w, "This setup link is expired, completed, revoked, or unknown.", 410)
		return
	}

	identity, e := s.readProject(r, r.PathValue("project"))
	if e != nil {
		dbError(w, e)
		return
	}

	branding := identity["branding"].(store.Object)

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer")
	// Only validated raster data URLs and six-digit hex colors enter trusted template types.
	logo := str(branding, "logo_data_url")
	if !validProjectLogo(logo) {
		logo = ""
	}

	accent := str(branding, "accent_color")
	if !accentPattern.MatchString(accent) {
		accent = "#171717"
	}

	theme := str(branding, "theme")
	if theme != "dark" {
		theme = "light"
	}

	rgb, _ := strconv.ParseUint(accent[1:], 16, 32)
	foreground := "#fff"

	if ((rgb>>16)*299+((rgb>>8)&255)*587+(rgb&255)*114)/1000 > 150 {
		foreground = "#171717"
	}

	var overrides strings.Builder

	for key, variable := range setupThemeKeys {
		if color := str(object(link, "theme_config"), key); accentPattern.MatchString(color) {
			overrides.WriteString(variable + ":" + color + ";")
		}
	}

	setupTemplate.Execute(w, struct {
		Name       string
		Logo       template.URL
		Accent     template.CSS
		Foreground template.CSS
		Theme      string
		Overrides  template.CSS
	}{str(identity, "name"), template.URL(logo), template.CSS(accent), template.CSS(foreground), theme, template.CSS(overrides.String())})
}

func (s *Server) setupAsset(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	contentType := ""

	switch name {
	case "setup.css":
		contentType = "text/css; charset=utf-8"
	case "setup.js":
		contentType = "application/javascript; charset=utf-8"
	default:
		http.NotFound(w, r)
		return
	}

	raw, e := setupFiles.ReadFile("setup/" + name)
	if e != nil {
		http.NotFound(w, r)
		return
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(raw)
}

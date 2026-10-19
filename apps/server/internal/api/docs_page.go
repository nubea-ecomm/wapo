package api

import (
	"embed"
	"html/template"
	"net/http"
	"strings"
)

//go:embed documentation/*
var documentation embed.FS
var docsTemplate = template.Must(template.ParseFS(documentation, "documentation/*.html"))

func (s *Server) docsPage(w http.ResponseWriter, r *http.Request) {
	console := strings.TrimSpace(strings.Split(s.Config.WebOrigin, ",")[0])
	if console == "" {
		console = "http://localhost:5173"
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	docsTemplate.ExecuteTemplate(w, "index.html", struct{ ConsoleURL string }{console})
}
func (s *Server) docsAsset(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	w.Header().Set("Cache-Control", "no-cache")
	if name == "scalar.js" {
		http.ServeFile(w, r, "../../packages/docs/vendor/scalar.js")
		return
	}
	types := map[string]string{"docs-polish.css": "text/css; charset=utf-8", "docs-theme.js": "text/javascript; charset=utf-8", "docs-theme.css": "text/css; charset=utf-8", "docs-content.css": "text/css; charset=utf-8", "docs.css": "text/css; charset=utf-8", "docs-shell.css": "text/css; charset=utf-8", "docs-responsive.css": "text/css; charset=utf-8", "docs-search.js": "text/javascript; charset=utf-8", "docs-search.css": "text/css; charset=utf-8", "docs.js": "text/javascript; charset=utf-8", "favicon.svg": "image/svg+xml", "wapo-wordmark.svg": "image/svg+xml"}
	contentType, ok := types[name]
	if !ok {
		http.NotFound(w, r)
		return
	}
	content, e := documentation.ReadFile("documentation/" + name)
	if e != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Write(content)
}

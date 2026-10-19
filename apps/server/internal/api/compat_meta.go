package api

import (
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"wapo.local/server/internal/store"
)

var graphVersion = regexp.MustCompile(`^v[0-9]+\.[0-9]+$`)

func methodIn(method, allowed string) bool { return strings.Contains(" "+allowed+" ", " "+method+" ") }
func (s *Server) compatMeta(w http.ResponseWriter, r *http.Request) {
	if s.bridgeEnabled(r) {
		s.bridge(w, r, s.Config.BridgeWhatsAppURL, "/meta/whatsapp/")
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/meta/whatsapp/"), "/"), "/")
	if len(parts) < 2 || len(parts) > 4 || !graphVersion.MatchString(parts[0]) {
		fail(w, 404, "not_found", "Invalid Meta API route")
		return
	}
	version, id := parts[0], parts[1]
	edge := ""
	if len(parts) > 2 {
		edge = parts[2]
	}
	if id == "media_download" && len(parts) == 2 && r.Method == "GET" {
		s.downloadMetaMedia(w, r)
		return
	}
	var c store.Object
	var e error
	target := ""
	assetKind := ""
	if id == "flows" && len(parts) == 3 && r.Method == "DELETE" {
		c, e = s.scopedMetaAsset(r, edge, "flow")
		target = version + "/" + url.PathEscape(edge)
	} else if edge == "message_templates" && methodIn(r.Method, "GET POST DELETE") {
		c, e = s.wabaConnection(r, id)
		target = version + "/" + url.PathEscape(id) + "/message_templates"
		assetKind = "template"
		templateID := r.URL.Query().Get("hsm_id")
		if len(parts) == 4 {
			templateID = parts[3]
		}
		if e == nil && templateID != "" {
			e = s.verifyMetaAsset(r, c, templateID, "template")
			target = version + "/" + url.PathEscape(templateID)
		}
		if len(parts) == 4 && r.Method != "GET" {
			fail(w, 405, "method_not_allowed", "Use GET for a template ID")
			return
		}
	} else if edge == "dataset" && len(parts) == 3 && methodIn(r.Method, "GET POST") {
		c, e = s.wabaConnection(r, id)
		target = version + "/" + url.PathEscape(id) + "/dataset"
		assetKind = "dataset"
	} else if edge == "events" && len(parts) == 3 && r.Method == "POST" {
		c, e = s.boundMetaAsset(r, id, "dataset")
		target = version + "/" + url.PathEscape(id) + "/events"
	} else if edge == "flows" && len(parts) == 3 && methodIn(r.Method, "GET POST") {
		c, e = s.phoneConnection(r, id)
		if e != nil {
			c, e = s.wabaConnection(r, id)
		}
		target = version + "/" + str(c, "business_account_id") + "/flows"
		assetKind = "flow"
	} else if methodIn(edge, "assets publish deprecate") && len(parts) == 3 && ((edge == "assets" && methodIn(r.Method, "GET POST")) || (edge != "assets" && r.Method == "POST")) {
		c, e = s.scopedMetaAsset(r, id, "flow")
		target = version + "/" + url.PathEscape(id) + "/" + edge
	} else if edge == "phone_numbers" && len(parts) == 3 && r.Method == "GET" {
		c, e = s.wabaConnection(r, id)
		target = version + "/" + url.PathEscape(id) + "/phone_numbers"
	} else if len(parts) == 2 && methodIn(r.Method, "GET POST DELETE") {
		if r.Method == "DELETE" {
			c, e = s.boundMetaAsset(r, id, "media")
			assetKind = "media"
		} else {
			c, e = s.phoneConnection(r, id)
			if e != nil && r.Method == "GET" {
				c, e = s.wabaConnection(r, id)
			}
			if e != nil {
				c, e = s.scopedMetaAsset(r, id, "flow")
			}
			if e != nil && r.Method == "GET" {
				c, e = s.boundMetaAsset(r, id, "media")
				assetKind = "media"
			}
		}
		target = version + "/" + url.PathEscape(id)
	} else if methodIn(edge, "messages marketing_messages conversations contacts calls username username_suggestions thread_control media whatsapp_business_profile call_permissions block_users") {
		c, e = s.phoneConnection(r, id)
		target = version + "/" + url.PathEscape(id) + "/" + edge
		if e == nil && s.localMetaData(w, r, c, parts) {
			return
		}
		allowed := map[string]string{"messages": "POST", "marketing_messages": "POST", "calls": "POST", "username": "GET POST DELETE", "username_suggestions": "GET", "thread_control": "POST", "media": "POST", "whatsapp_business_profile": "GET POST", "call_permissions": "GET", "block_users": "GET POST DELETE"}
		if len(parts) != 3 || !methodIn(r.Method, allowed[edge]) {
			fail(w, 404, "not_found", "Meta operation not found")
			return
		}
		if edge == "media" {
			assetKind = "media"
		}
	} else {
		fail(w, 404, "not_found", "Meta operation not found")
		return
	}
	if e != nil {
		dbError(w, e)
		return
	}
	s.relayMeta(w, r, c, target, assetKind)
}

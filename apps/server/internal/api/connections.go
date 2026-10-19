package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) connections(w http.ResponseWriter, r *http.Request, id string) {
	p := project(r)
	if r.Method == "GET" {
		if id == "" {
			s.list(w, r, "connections", map[string]string{"customer_id": r.URL.Query().Get("customer_id"), "channel": s.Config.ChannelFilter()})
			return
		}
		s.getOnly(w, r, "connections", id)
		return
	}
	if r.Method == "PATCH" && id != "" {
		s.updateConnection(w, r, id)
		return
	}
	if r.Method == "DELETE" && id != "" {
		if e := s.Store.Delete(r.Context(), p, "connections", id); e != nil {
			dbError(w, e)
			return
		}
		write(w, 200, store.Object{"data": store.Object{"id": id, "deleted": true}})
		return
	}
	if r.Method != "POST" || id != "" {
		fail(w, 405, "method_not_allowed", "Method not supported")
		return
	}
	o, e := decode(r)
	if e != nil {
		fail(w, 400, "invalid_json", "Valid JSON object required")
		return
	}
	if strings.TrimSpace(str(o, "name")) == "" {
		fail(w, 422, "validation_error", "name is required")
		return
	}
	typ := str(o, "channel")
	if !s.Config.ChannelEnabled(typ) {
		fail(w, 422, "unsupported_channel", "This channel is not enabled; use whatsapp")
		return
	}
	if cid := str(o, "customer_id"); cid != "" {
		if _, e = s.Store.Get(r.Context(), p, "customers", cid); e != nil {
			dbError(w, e)
			return
		}
	}
	if typ == "whatsapp" {
		if !numeric(str(o, "external_id")) || !numeric(str(o, "business_account_id")) || str(o, "access_token") == "" {
			fail(w, 422, "validation_error", "WhatsApp requires numeric external_id (Meta phone ID), business_account_id, and access_token")
			return
		}
		// Verify the token before accepting the binding; metadata is authoritative at Meta.
		status, b, e := s.Meta.Call(r.Context(), "GET", s.Config.MetaVersion+"/"+str(o, "external_id"), str(o, "access_token"), nil, "fields=id,display_phone_number,quality_rating,is_on_biz_app")
		if e != nil {
			fail(w, 502, "provider_unavailable", "Could not verify Meta phone number")
			return
		}
		if status != 200 {
			rawJSON(w, status, b)
			return
		}
		var details store.Object
		if json.Unmarshal(b, &details) != nil {
			fail(w, 502, "provider_error", "Invalid provider response")
			return
		}
		// Verify that the caller's WABA actually owns this phone; never trust a browser-provided association.
		checkStatus, checkBody, checkErr := s.Meta.Call(r.Context(), "GET", s.Config.MetaVersion+"/"+str(o, "business_account_id")+"/phone_numbers", str(o, "access_token"), nil, "fields=id&limit=100")
		var account struct {
			Data []store.Object `json:"data"`
		}
		owned := false
		if checkErr == nil && checkStatus == 200 && json.Unmarshal(checkBody, &account) == nil {
			for _, phone := range account.Data {
				if str(phone, "id") == str(o, "external_id") {
					owned = true
				}
			}
		}
		if !owned {
			fail(w, 422, "asset_verification_failed", "Cannot verify that the phone belongs to this WABA")
			return
		}
		o["connection_type"] = "dedicated"
		if details["is_on_biz_app"] == true {
			o["connection_type"] = "coexistence"
		}
		o["display_phone_number"] = details["display_phone_number"]
		o["quality_rating"] = details["quality_rating"]
		o["access_token"] = s.Store.Seal(str(o, "access_token"), p)
	}
	// Accept a narrow schema so callers cannot inject encrypted fields or server state.
	result := store.Object{"id": store.ID("con"), "channel": typ, "name": str(o, "name"), "customer_id": str(o, "customer_id"), "created_at": time.Now().UTC().Format(time.RFC3339Nano), "status": "connected", "inbound_processing_enabled": true}
	for _, key := range []string{"external_id", "business_account_id", "access_token", "display_phone_number", "quality_rating", "connection_type"} {
		if typ != "whatsapp" {
			continue
		}
		if v, ok := o[key]; ok {
			result[key] = v
		}
	}
	if typ == "whatsapp" {
		rows, _, err := s.Store.List(r.Context(), p, "connections", map[string]string{"external_id": str(o, "external_id")}, "", 1)
		if err != nil {
			dbError(w, err)
			return
		}
		if len(rows) > 0 {
			fail(w, 422, "already_exists", "Phone number is already connected")
			return
		}
	}
	if e = s.Store.Put(r.Context(), p, "connections", str(result, "id"), result, true); e != nil {
		dbError(w, e)
		return
	}
	write(w, 201, store.Object{"data": clean(result)})
}

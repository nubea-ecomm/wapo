package api

import (
	"encoding/json"
	"net/http"
	"net/url"

	"wapo.local/server/internal/store"
)

func (s *Server) wabaConnection(r *http.Request, id string) (store.Object, error) {
	if id == "" {
		return nil, store.ErrNotFound
	}

	rows, _, e := s.Store.List(r.Context(), project(r), "connections", map[string]string{"channel": "whatsapp", "business_account_id": id}, "", 1)
	if e != nil {
		return nil, e
	}

	if len(rows) == 0 {
		return nil, store.ErrNotFound
	}

	return rows[0], nil
}

func (s *Server) rememberMetaAsset(r *http.Request, c store.Object, kind, id string) error {
	if id == "" {
		return nil
	}

	return s.Store.Put(r.Context(), project(r), "meta_assets", kind+":"+id, store.Object{"id": id, "kind": kind, "connection_id": c["id"], "business_account_id": c["business_account_id"]}, false)
}

func (s *Server) boundMetaAsset(r *http.Request, id, kind string) (store.Object, error) {
	asset, e := s.Store.Get(r.Context(), project(r), "meta_assets", kind+":"+id)
	if e != nil {
		return nil, e
	}

	return s.Store.Get(r.Context(), project(r), "connections", str(asset, "connection_id"))
}

func (s *Server) verifyMetaAsset(r *http.Request, c store.Object, id, kind string) error {
	if existing, e := s.boundMetaAsset(r, id, kind); e == nil && str(existing, "business_account_id") == str(c, "business_account_id") {
		return nil
	}

	edge := "flows"
	if kind == "template" {
		edge = "message_templates"
	}

	token, e := s.Store.Unseal(str(c, "access_token"), project(r))
	if e != nil {
		return e
	}

	after := ""

	for page := 0; page < 100; page++ {
		q := url.Values{"fields": {"id"}, "limit": {"100"}}
		if after != "" {
			q.Set("after", after)
		}

		status, raw, e := s.Meta.Call(r.Context(), "GET", s.Config.MetaVersion+"/"+str(c, "business_account_id")+"/"+edge, token, nil, q.Encode())
		if e != nil {
			return e
		}

		if status != 200 {
			return store.ErrNotFound
		}

		var body store.Object

		if json.Unmarshal(raw, &body) != nil {
			return store.ErrNotFound
		}

		list, _ := body["data"].([]any)
		for _, item := range list {
			o, _ := item.(map[string]any)
			assetID := str(o, "id")

			if e = s.rememberMetaAsset(r, c, kind, assetID); e != nil {
				return e
			}

			if assetID == id {
				return nil
			}
		}

		paging := object(body, "paging")
		next := str(object(paging, "cursors"), "after")

		if str(paging, "next") == "" || next == "" || next == after {
			break
		}

		after = next
	}

	return store.ErrNotFound
}

func (s *Server) scopedMetaAsset(r *http.Request, id, kind string) (store.Object, error) {
	if c, e := s.boundMetaAsset(r, id, kind); e == nil {
		return c, nil
	}

	var (
		c store.Object
		e error
	)

	if phone := r.URL.Query().Get("phone_number_id"); phone != "" {
		c, e = s.phoneConnection(r, phone)
	} else {
		c, e = s.wabaConnection(r, r.URL.Query().Get("business_account_id"))
	}

	if e != nil {
		return nil, e
	}

	if e = s.verifyMetaAsset(r, c, id, kind); e != nil {
		return nil, e
	}

	return c, nil
}

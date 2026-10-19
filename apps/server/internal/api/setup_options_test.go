package api

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
	"wapo.local/server/internal/store"
)

func TestSetupLinkThemeUpdatesAndAllowedOrigin(t *testing.T) {
	s, h, p, key := fixture(t)
	s.Config.MetaAppID = "app"
	s.Config.MetaConfigID = "config"
	s.Config.PublicURL = h.URL
	status, body := request(t, h.URL, key, "POST", "/v1/customers", store.Object{"name": "Merchant"}, "")
	expect(t, status, 201, body)
	customer := str(object(body, "data"), "id")
	status, body = request(t, h.URL, key, "POST", "/v1/customers/"+customer+"/setup_links", store.Object{"theme_config": store.Object{"background_color": "#112233"}, "allowed_origins": []string{"https://signup.example"}}, "")
	expect(t, status, 201, body)
	link := object(body, "data")
	id := str(link, "id")
	token := str(link, "token")
	expires, e := time.Parse(time.RFC3339Nano, str(link, "expires_at"))
	if e != nil || time.Until(expires) < 29*24*time.Hour {
		t.Fatal("default lifetime is not thirty days")
	}
	status, body = request(t, h.URL, key, "GET", "/v1/setup_links/"+id, nil, "")
	expect(t, status, 200, body)
	if str(object(body, "data"), "url") != str(link, "url") || object(body, "data")["onboarding_token"] != nil {
		t.Fatal("capability retrieval is unsafe or missing")
	}
	res, e := http.Get(str(link, "url"))
	if e != nil {
		t.Fatal(e)
	}
	raw, _ := io.ReadAll(res.Body)
	res.Body.Close()
	if !strings.Contains(string(raw), "--bg:#112233;") {
		t.Fatal("per-link branding not rendered")
	}
	path := "/public/setup/" + p + "/" + token + "/complete"
	for _, origin := range []string{"https://signup.example", "https://foreign.example"} {
		req, _ := http.NewRequest("OPTIONS", h.URL+path, nil)
		req.Header.Set("Origin", origin)
		res, e := http.DefaultClient.Do(req)
		if e != nil {
			t.Fatal(e)
		}
		res.Body.Close()
		allowed := res.Header.Get("Access-Control-Allow-Origin") == origin
		if allowed != (origin == "https://signup.example") {
			t.Fatal("origin scope not enforced")
		}
	}
	status, body = request(t, h.URL, key, "PATCH", "/platform/v1/customers/"+customer+"/setup_links/"+id, store.Object{"setup_link": store.Object{"status": "revoked"}}, "")
	expect(t, status, 200, body)
	status, body = request(t, h.URL, "", "GET", "/public/setup/"+p+"/"+token, nil, "")
	expect(t, status, 410, body)
	status, body = request(t, h.URL, key, "POST", "/v1/customers/"+customer+"/setup_links", store.Object{"theme_config": store.Object{"background_color": "red;}</style><script>"}}, "")
	expect(t, status, 422, body)
}

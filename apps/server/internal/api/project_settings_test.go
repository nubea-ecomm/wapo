package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"image"
	"image/png"
	"io"
	"net/http"
	"strings"
	"testing"

	"wapo.local/server/internal/store"
)

func testLogo(t *testing.T) string {
	t.Helper()

	var raw bytes.Buffer

	if e := png.Encode(&raw, image.NewRGBA(image.Rect(0, 0, 2, 2))); e != nil {
		t.Fatal(e)
	}

	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(raw.Bytes())
}

func TestProjectLogoValidation(t *testing.T) {
	for _, value := range []string{"data:image/svg+xml;base64,PHN2Zz4=", "https://example.com/logo.png", "data:image/png;base64,YmFk", "data:image/jpeg;base64," + strings.Repeat("A", 8<<20)} {
		if validProjectLogo(value) {
			t.Fatal("accepted invalid logo")
		}
	}

	if !validProjectLogo("") || !validProjectLogo(testLogo(t)) {
		t.Fatal("rejected valid logo")
	}
}

func TestProjectBrandingIsScopedAndUpdatesExistingHostedLinks(t *testing.T) {
	server, h, p, key := fixture(t)
	server.Config.MetaAppID = "app"
	server.Config.MetaConfigID = "config"
	status, o := request(t, h.URL, key, "GET", "/v1/project", nil, "")
	expect(t, status, 200, o)

	if str(object(o, "data"), "id") != p {
		t.Fatal("wrong project")
	}

	status, o = request(t, h.URL, key, "PATCH", "/v1/project", store.Object{"name": "<script>alert(1)</script>", "branding": store.Object{"logo_data_url": testLogo(t), "accent_color": "#ffcc00", "theme": "dark"}}, "")
	expect(t, status, 200, o)
	logoURL := str(object(o, "data"), "logo_url")

	logoResponse, e := http.Get(h.URL + logoURL)
	if e != nil {
		t.Fatal(e)
	}

	logoBytes, _ := io.ReadAll(logoResponse.Body)
	logoResponse.Body.Close()

	if logoResponse.StatusCode != 200 || logoResponse.Header.Get("Content-Type") != "image/png" || len(logoBytes) == 0 {
		t.Fatal("logo asset unavailable")
	}

	invalidLogo, e := http.Get(h.URL + logoURL + "bad")
	if e != nil {
		t.Fatal(e)
	}

	invalidLogo.Body.Close()

	if invalidLogo.StatusCode != 404 {
		t.Fatal("invalid logo hash accepted")
	}

	status, o = request(t, h.URL, key, "POST", "/v1/customers", store.Object{"name": "Brand customer"}, "")
	expect(t, status, 201, o)
	customer := str(object(o, "data"), "id")
	status, o = request(t, h.URL, key, "POST", "/v1/customers/"+customer+"/setup_links", store.Object{}, "")
	expect(t, status, 201, o)
	token := str(object(o, "data"), "token")
	pageURL := h.URL + "/setup/" + p + "/" + token

	res, e := http.Get(pageURL)
	if e != nil {
		t.Fatal(e)
	}

	raw, _ := io.ReadAll(res.Body)
	res.Body.Close()

	html := string(raw)
	if res.StatusCode != 200 || !strings.Contains(html, `data-theme="dark"`) || !strings.Contains(html, "data:image/png;base64,") || !strings.Contains(html, "#ffcc00") || strings.Contains(html, "<script>alert(1)</script>") || !strings.Contains(html, "&lt;script&gt;") {
		t.Fatalf("incorrect branded page: %s", html)
	}

	status, o = request(t, h.URL, key, "GET", "/public/setup/"+p+"/"+token, nil, "")
	expect(t, status, 200, o)

	if str(object(o, "data"), "project_name") != "<script>alert(1)</script>" {
		t.Fatal("missing public identity")
	}

	status, o = request(t, h.URL, key, "PATCH", "/v1/project", store.Object{"name": "Updated brand", "branding": store.Object{"logo_data_url": ""}}, "")
	expect(t, status, 200, o)

	res, e = http.Get(pageURL)
	if e != nil {
		t.Fatal(e)
	}

	raw, _ = io.ReadAll(res.Body)
	res.Body.Close()

	if !strings.Contains(string(raw), "Updated brand") || strings.Contains(string(raw), "data:image/png;base64,") {
		t.Fatal("old link did not receive updated identity")
	}

	for _, bad := range []store.Object{{"branding": store.Object{"accent_color": "red;}</style><script>"}}, {"branding": store.Object{"theme": "custom"}}, {"branding": store.Object{"logo_data_url": "data:image/svg+xml;base64,PHN2Zz4="}}, {"name": " "}} {
		status, o = request(t, h.URL, key, "PATCH", "/v1/project", bad, "")
		expect(t, status, 422, o)
	}

	other := store.ID("brand_other")
	otherKey := store.ID("key")

	if e = server.Store.Bootstrap(context.Background(), other, otherKey); e != nil {
		t.Fatal(e)
	}

	t.Cleanup(func() {
		server.Store.Pool.Exec(context.Background(), "DELETE FROM api_keys WHERE project_id=$1", other)
		server.Store.Pool.Exec(context.Background(), "DELETE FROM projects WHERE id=$1", other)
	})
	status, o = request(t, h.URL, otherKey, "GET", "/v1/project", nil, "")
	expect(t, status, 200, o)

	if str(object(o, "data"), "name") == "Updated brand" || str(object(o, "data"), "id") != other {
		t.Fatal("branding crossed project boundary")
	}

	status, o = request(t, h.URL, key, "DELETE", "/v1/setup_links/"+store.Hash(token), nil, "")
	expect(t, status, 200, o)

	res, e = http.Get(pageURL)
	if e != nil {
		t.Fatal(e)
	}

	res.Body.Close()

	if res.StatusCode != 410 {
		t.Fatal("revoked link exposed branding")
	}
}

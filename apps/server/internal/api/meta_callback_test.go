package api

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"testing"
	"time"

	"wapo.local/server/internal/store"
)

func TestGlobalMetaVerificationAppliesToNewProjectsAndIsConfigBound(t *testing.T) {
	s, h, p1, _ := fixture(t)
	ctx := context.Background()
	s.Config.MetaAppID = store.ID("app")
	s.Config.PublicURL = h.URL + "/"
	app := s.Config.MetaAppID

	t.Cleanup(func() { s.Store.Pool.Exec(ctx, "DELETE FROM meta_webhook_verifications WHERE app_id=$1", app) })

	query := url.Values{"hub.mode": {"subscribe"}, "hub.verify_token": {s.Config.MetaVerifyToken}, "hub.challenge": {"global-challenge"}}

	res, err := http.Get(h.URL + "/hooks/meta?" + query.Encode())
	if err != nil {
		t.Fatal(err)
	}

	body, _ := io.ReadAll(res.Body)
	res.Body.Close()

	if res.StatusCode != 200 || string(body) != "global-challenge" {
		t.Fatalf("verification failed: %d %s", res.StatusCode, body)
	}

	var tokenHash string

	if err = s.Store.Pool.QueryRow(ctx, "SELECT token_hash FROM meta_webhook_verifications WHERE app_id=$1 AND callback_url=$2", app, h.URL+"/hooks/meta").Scan(&tokenHash); err != nil || tokenHash != store.Hash(s.Config.MetaVerifyToken) {
		t.Fatal("global verification was not persisted with a token hash", err)
	}

	_, _, p2, _ := fixture(t)
	connections := []store.Object{metaTestConnection(t, s, p1, "waba-"+p1, "phone-"+p1), metaTestConnection(t, s, p2, "waba-"+p2, "phone-"+p2)}
	check := func(p string, c store.Object) store.Object {
		t.Helper()

		report, e := s.checkConnection(ctx, p, c)
		if e != nil {
			t.Fatal(e)
		}

		for _, value := range report["checks"].([]store.Object) {
			if str(value, "id") == "webhook_verification" {
				return value
			}
		}

		t.Fatal("missing webhook verification check")

		return nil
	}

	for index, p := range []string{p1, p2} {
		result := check(p, connections[index])
		if str(result, "status") != "pass" || str(result, "scope") != "app" || str(result, "callback_url") != h.URL+"/hooks/meta" {
			t.Fatalf("new project did not inherit global verification: %#v", result)
		}
	}

	s.Config.MetaVerifyToken = "rotated-token"

	if str(check(p2, connections[1]), "status") != "unknown" {
		t.Fatal("verification for another token was reused")
	}

	query.Set("hub.verify_token", "wrong-token")

	res, err = http.Get(h.URL + "/hooks/meta?" + query.Encode())
	if err != nil {
		t.Fatal(err)
	}

	res.Body.Close()

	if res.StatusCode != 403 {
		t.Fatal("wrong verify token accepted")
	}

	if err = s.Store.Put(ctx, p1, "meta_webhook_verification", "current", store.Object{"id": "current", "verified_at": time.Now().UTC().Format(time.RFC3339Nano)}, false); err != nil {
		t.Fatal(err)
	}

	if result := check(p1, connections[0]); str(result, "status") != "pass" || str(result, "scope") != "project" {
		t.Fatalf("legacy verification compatibility lost: %#v", result)
	}
}

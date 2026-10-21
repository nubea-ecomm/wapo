package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"
)

func TestPasswordChangeRevalidatesAccountAfterWaitingForLock(t *testing.T) {
	s, h, _, _ := fixture(t)
	_, token, id := signupAccount(t, s, h.URL)
	ctx := context.Background()

	tx, err := s.Store.Pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)

	if _, err = tx.Exec(ctx, "UPDATE console_users SET active=false WHERE id=$1", id); err != nil {
		t.Fatal(err)
	}

	type outcome struct {
		status int
		err    error
	}

	result := make(chan outcome, 1)

	go func() {
		req, e := http.NewRequest("POST", h.URL+"/auth/v1/password", strings.NewReader(`{"current_password":"signup-password-123","password":"replacement-password-123"}`))
		if e != nil {
			result <- outcome{err: e}
			return
		}

		req.Header.Set("X-API-Key", token)
		req.Header.Set("Content-Type", "application/json")

		res, e := http.DefaultClient.Do(req)
		if e != nil {
			result <- outcome{err: e}
			return
		}

		res.Body.Close()

		result <- outcome{status: res.StatusCode}
	}()

	deadline := time.Now().Add(5 * time.Second)

	for {
		var waiting bool

		err = s.Store.Pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT email FROM console_users WHERE id=%')`).Scan(&waiting)
		if err != nil {
			t.Fatal(err)
		}

		if waiting {
			break
		}

		if time.Now().After(deadline) {
			t.Fatal("password request did not wait for the account lock")
		}

		time.Sleep(10 * time.Millisecond)
	}

	if err = tx.Commit(ctx); err != nil {
		t.Fatal(err)
	}

	select {
	case got := <-result:
		if got.err != nil || got.status != 401 {
			t.Fatalf("deactivated account changed its password: %+v", got)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("password request did not complete")
	}
}

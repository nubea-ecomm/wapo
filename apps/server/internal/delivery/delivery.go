package delivery

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

func Signature(body []byte, secret string) string {
	h := hmac.New(sha256.New, []byte(secret))
	h.Write(body)
	return hex.EncodeToString(h.Sum(nil))
}
func Verify(body []byte, secret, signature string) bool {
	if secret == "" {
		return false
	}
	got, e := hex.DecodeString(signature)
	if e != nil {
		return false
	}
	expected, _ := hex.DecodeString(Signature(body, secret))
	return hmac.Equal(got, expected)
}
func ValidateURL(raw string, allowPrivate bool) error {
	u, e := url.Parse(raw)
	if e != nil || u.Hostname() == "" || u.User != nil || u.Fragment != "" {
		return fmt.Errorf("invalid webhook URL")
	}
	if u.Scheme != "https" && !(allowPrivate && u.Scheme == "http") {
		return fmt.Errorf("webhook URL requires HTTPS")
	}
	return nil
}
func publicIP(ip net.IP) bool {
	a, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	a = a.Unmap()
	// Reject non-public destinations, including cloud metadata and IPv4-mapped addresses.
	for _, cidr := range []string{"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12", "192.168.0.0/16", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4", "::/128", "::1/128", "fc00::/7", "fe80::/10", "ff00::/8", "2001:db8::/32"} {
		p := netip.MustParsePrefix(cidr)
		if p.Contains(a) {
			return false
		}
	}
	return a.IsGlobalUnicast()
}
func Client(allowPrivate bool) *http.Client {
	dial := func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, e := net.SplitHostPort(address)
		if e != nil {
			return nil, e
		}
		ips, e := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if e != nil {
			return nil, e
		}
		if len(ips) == 0 {
			return nil, fmt.Errorf("empty DNS response")
		}
		for _, ip := range ips {
			if !allowPrivate && !publicIP(ip) {
				return nil, fmt.Errorf("private webhook destination denied")
			}
		}
		var last error
		for _, ip := range ips {
			conn, e := (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
			if e == nil {
				return conn, nil
			}
			last = e
		}
		return nil, last
	}
	return &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{DialContext: dial, Proxy: nil, TLSHandshakeTimeout: 5 * time.Second}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}

// Record atomically persists a source event and its delivery outbox. Duplicate source keys are harmless.
func Record(ctx context.Context, s *store.Store, p, source, name string, payload store.Object, connection string, mutate func(pgx.Tx) error) error {
	tx, e := s.Pool.Begin(ctx)
	if e != nil {
		return e
	}
	defer tx.Rollback(ctx)
	if e = RecordTx(ctx, tx, p, source, name, payload, connection, mutate); e != nil {
		return e
	}
	return tx.Commit(ctx)
}

// RecordTx queues an event in an existing transaction so domain state and delivery remain atomic.
func RecordTx(ctx context.Context, tx pgx.Tx, p, source, name string, payload store.Object, connection string, mutate func(pgx.Tx) error) error {
	id := store.ID("evt")
	b, _ := json.Marshal(payload)
	tag, e := tx.Exec(ctx, "INSERT INTO events(id,project_id,source_key,name,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(project_id,source_key) DO NOTHING", id, p, source, name, b)
	if e != nil {
		return e
	}
	if tag.RowsAffected() == 0 {
		return nil
	}
	if mutate != nil {
		if e = mutate(tx); e != nil {
			return e
		}
	}
	rows, e := tx.Query(ctx, "SELECT id,data FROM resources WHERE project_id=$1 AND kind='webhooks'", p)
	if e != nil {
		return e
	}
	type sub struct {
		id   string
		data store.Object
	}
	subs := []sub{}
	for rows.Next() {
		var id string
		var raw []byte
		if e = rows.Scan(&id, &raw); e != nil {
			rows.Close()
			return e
		}
		var o store.Object
		if e = json.Unmarshal(raw, &o); e != nil {
			rows.Close()
			return e
		}
		subs = append(subs, sub{id, o})
	}
	rows.Close()
	if rows.Err() != nil {
		return rows.Err()
	}
	for _, sub := range subs {
		if sub.data["active"] == false {
			continue
		}
		if c, _ := sub.data["connection_id"].(string); c != "" && c != connection {
			continue
		}
		match := false
		events, _ := sub.data["events"].([]any)
		for _, v := range events {
			if v == name || v == "*" {
				match = true
			}
		}
		if !match {
			continue
		}
		if _, e = tx.Exec(ctx, "INSERT INTO deliveries(id,project_id,event_id,subscription_id) VALUES($1,$2,$3,$4)", store.ID("del"), p, id, sub.id); e != nil {
			return e
		}
	}
	return nil
}
func Run(ctx context.Context, s *store.Store, allowPrivate bool) {
	client := Client(allowPrivate)
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for i := 0; i < 20; i++ {
				ok, e := once(ctx, s, client)
				if e != nil {
					slog.Error("webhook worker", "error", e)
					break
				}
				if !ok {
					break
				}
			}
		}
	}
}
func once(ctx context.Context, s *store.Store, client *http.Client) (bool, error) {
	var id, p, event, sub, name string
	var payload []byte
	var attempts int
	e := s.Pool.QueryRow(ctx, `WITH candidate AS (SELECT id FROM deliveries WHERE state IN ('pending','processing') AND available_at<=now() ORDER BY available_at FOR UPDATE SKIP LOCKED LIMIT 1)
 UPDATE deliveries SET state='processing',available_at=now()+interval '60 seconds',attempts=attempts+1 FROM candidate WHERE deliveries.id=candidate.id RETURNING deliveries.id,project_id,event_id,subscription_id,attempts`).Scan(&id, &p, &event, &sub, &attempts)
	if e == pgx.ErrNoRows {
		return false, nil
	}
	if e != nil {
		return false, e
	}
	subscription, e := s.Get(ctx, p, "webhooks", sub)
	if e != nil && !errors.Is(e, store.ErrNotFound) {
		return true, e
	}
	if errors.Is(e, store.ErrNotFound) || subscription["active"] == false {
		_, err := s.Pool.Exec(ctx, "UPDATE deliveries SET state='cancelled' WHERE id=$1", id)
		return true, err
	}
	e = s.Pool.QueryRow(ctx, "SELECT name,payload FROM events WHERE id=$1", event).Scan(&name, &payload)
	if e != nil {
		return true, e
	}
	secret, e := s.Unseal(subscription["secret_key"].(string), p)
	if e != nil {
		return true, e
	}
	req, e := http.NewRequestWithContext(ctx, "POST", subscription["url"].(string), bytes.NewReader(payload))
	if e != nil {
		return true, e
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Signature", Signature(payload, secret))
	req.Header.Set("X-Webhook-Event", name)
	req.Header.Set("X-Idempotency-Key", event)
	status := 0
	res, sendErr := client.Do(req)
	if sendErr == nil {
		status = res.StatusCode
		res.Body.Close()
	}
	state, delay := deliveryOutcome(status, attempts)
	_, e = s.Pool.Exec(ctx, "UPDATE deliveries SET state=$2,last_status=$3,available_at=$4 WHERE id=$1", id, state, status, time.Now().Add(delay))
	if sendErr != nil {
		slog.Warn("webhook delivery failed", "delivery_id", id, "attempt", attempts, "reason", strings.Split(sendErr.Error(), ":")[0])
	}
	return true, e
}

func deliveryOutcome(status, attempts int) (string, time.Duration) {
	state := "pending"
	if status >= 200 && status < 300 {
		state = "delivered"
	} else if attempts >= 8 {
		state = "failed"
	}
	return state, time.Duration(1<<min(attempts, 10)) * time.Second
}

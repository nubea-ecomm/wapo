// Package channel defines the provider boundary; domain records do not depend on a transport.
package channel

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"

	"wapo.local/server/internal/store"
)

type Capabilities struct {
	Text        bool `json:"text"`
	Media       bool `json:"media"`
	Templates   bool `json:"templates"`
	Interactive bool `json:"interactive"`
}
type Result struct {
	ProviderID string
	Raw        store.Object
}
type Connector interface {
	Capabilities() Capabilities
	Send(context.Context, store.Object, string, store.Object) (Result, error)
}
type Webchat struct{}

func (Webchat) Capabilities() Capabilities { return Capabilities{Text: true} }
func (Webchat) Send(_ context.Context, _ store.Object, _ string, payload store.Object) (Result, error) {
	if payload["type"] != "text" {
		return Result{}, fmt.Errorf("webchat currently supports text only")
	}
	id := store.ID("msg")
	return Result{id, store.Object{"id": id, "status": "sent"}}, nil
}

type WhatsApp struct {
	BaseURL, Version string
	MessageEndpoint  string
	Client           *http.Client
}

func (WhatsApp) Capabilities() Capabilities { return Capabilities{true, true, true, true} }
func (w WhatsApp) Send(ctx context.Context, c store.Object, token string, payload store.Object) (Result, error) {
	b, _ := json.Marshal(payload)
	status, raw, e := w.Call(ctx, http.MethodPost, w.Version+"/"+url.PathEscape(c["external_id"].(string))+"/"+w.messageEndpoint(), token, b, "")
	if e != nil {
		return Result{}, e
	}
	if status < 200 || status >= 300 {
		return Result{}, &ProviderError{status, raw}
	}
	var o store.Object
	if e = json.Unmarshal(raw, &o); e != nil {
		return Result{}, e
	}
	messages, _ := o["messages"].([]any)
	if len(messages) == 0 {
		return Result{}, fmt.Errorf("provider response has no message id")
	}
	m, _ := messages[0].(map[string]any)
	id, _ := m["id"].(string)
	if id == "" {
		return Result{}, fmt.Errorf("provider response has no message id")
	}
	return Result{id, o}, nil
}

type ProviderError struct {
	Status int
	Body   []byte
}

func (e *ProviderError) Error() string { return fmt.Sprintf("provider returned HTTP %d", e.Status) }
func (w WhatsApp) Call(ctx context.Context, method, path, token string, body []byte, query string) (int, []byte, error) {
	u := w.BaseURL + "/" + path
	if query != "" {
		u += "?" + query
	}
	req, e := http.NewRequestWithContext(ctx, method, u, bytes.NewReader(body))
	if e != nil {
		return 0, nil, e
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	req.Header.Set("Content-Type", "application/json")
	client := w.Client
	if client == nil {
		client = &http.Client{Timeout: 25 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	}
	res, e := client.Do(req)
	if e != nil {
		return 0, nil, e
	}
	defer res.Body.Close()
	raw, e := io.ReadAll(io.LimitReader(res.Body, 8<<20))
	if e != nil {
		return 0, nil, e
	}
	return res.StatusCode, raw, nil
}

func (w WhatsApp) messageEndpoint() string {
	if w.MessageEndpoint == "marketing_messages" {
		return w.MessageEndpoint
	}
	return "messages"
}

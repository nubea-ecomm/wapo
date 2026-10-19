package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

func (s *Server) connectionHealth(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != "GET" && r.Method != "POST" {
		fail(w, 405, "method_not_allowed", "Use GET or POST")
		return
	}

	c, e := s.Store.Get(r.Context(), project(r), "connections", id)
	if e != nil {
		dbError(w, e)
		return
	}

	cached, e := s.Store.Get(r.Context(), project(r), "connection_health", id)
	if r.Method == "GET" && e == nil {
		write(w, 200, store.Object{"data": cached})
		return
	}

	if r.Method == "POST" && e == nil {
		at, _ := time.Parse(time.RFC3339Nano, str(cached, "checked_at"))
		if time.Since(at) < 5*time.Second {
			w.Header().Set("Retry-After", "5")
			fail(w, 429, "check_rate_limit", "Wait five seconds between checks")

			return
		}
	}

	result, e := s.checkConnection(r.Context(), project(r), c)
	if e != nil {
		dbError(w, e)
		return
	}

	write(w, 200, store.Object{"data": result})
}

func (s *Server) checkConnection(ctx context.Context, p string, c store.Object) (store.Object, error) {
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()

	lock, e := s.Store.Pool.Acquire(ctx)
	if e != nil {
		return nil, e
	}
	defer lock.Release()

	lockID := "health:" + p + ":" + str(c, "id")

	var acquired bool

	if e = lock.QueryRow(ctx, "SELECT pg_try_advisory_lock(hashtextextended($1,0))", lockID).Scan(&acquired); e != nil {
		return nil, e
	}

	if !acquired {
		var raw []byte

		e = lock.QueryRow(ctx, "SELECT data FROM resources WHERE project_id=$1 AND kind='connection_health' AND id=$2", p, str(c, "id")).Scan(&raw)

		var cached store.Object

		if e == nil {
			e = json.Unmarshal(raw, &cached)
		}

		return cached, notFound(e)
	}

	defer func() {
		unlock, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()

		lock.Exec(unlock, "SELECT pg_advisory_unlock(hashtextextended($1,0))", lockID)
	}()

	token, e := s.Store.Unseal(str(c, "access_token"), p)
	checks := []store.Object{}
	add := func(id, label, state, message string, details store.Object) {
		o := store.Object{"id": id, "label": label, "status": state, "message": message}
		for k, v := range details {
			o[k] = v
		}

		checks = append(checks, o)
	}
	call := func(path, fields string) (store.Object, int) {
		q := url.Values{}
		if fields != "" {
			q.Set("fields", fields)
		}

		status, raw, err := s.Meta.Call(ctx, "GET", s.Config.MetaVersion+"/"+path, token, nil, q.Encode())

		var o store.Object

		if err != nil || json.Unmarshal(raw, &o) != nil {
			return nil, 0
		}

		return o, status
	}
	safeError := func(o store.Object) store.Object {
		provider := object(o, "error")
		message := str(provider, "message")

		for _, secret := range []string{token, s.Config.MetaAppSecret} {
			if secret != "" {
				message = strings.ReplaceAll(message, secret, "[redacted]")
			}
		}

		if len(message) > 600 {
			message = message[:600]
		}

		return store.Object{"provider_error": store.Object{"code": provider["code"], "message": message}}
	}
	billing := store.Object{"status": "unknown", "manage_url": "https://business.facebook.com/wa/manage/accounts/?waba_id=" + url.QueryEscape(str(c, "business_account_id"))}
	result := store.Object{"id": str(c, "id"), "connection_type": c["connection_type"], "billing": billing}

	if e != nil || token == "" {
		add("access_token", "Credenciales", "fail", "No se pueden leer las credenciales. Reconectá el número.", nil)
	} else {
		var tokenState connectionTokenState

		token, tokenState, e = s.ensureConnectionToken(ctx, p, c, token)
		if e != nil {
			return nil, e
		}

		if tokenState.Expired {
			add("access_token", "Credenciales", "fail", "El token venció y Meta requiere que el titular vuelva a autorizar la conexión.", nil)
		} else if tokenState.Refreshed {
			add("access_token_refresh", "Renovación del token", "pass", "La credencial se renovó automáticamente antes de vencer.", nil)
		}

		s.checkConnectionToken(ctx, token, add)

		phone, status := call(url.PathEscape(str(c, "external_id")), "id,display_phone_number,quality_rating")
		if status == 200 && str(phone, "id") == str(c, "external_id") {
			add("phone_access", "Acceso al número", "pass", "El token permite consultar este número.", nil)

			result["quality_rating"] = phone["quality_rating"]
			if str(phone, "quality_rating") == "RED" {
				add("quality", "Calidad del número", "warning", "Meta reporta calidad baja para este número.", nil)
			}
		} else {
			state := "fail"
			if status == 0 || status == 429 || status >= 500 {
				state = "unknown"
			}

			add("phone_access", "Acceso al número", state, "No se pudo confirmar el acceso. Revisá permisos y credenciales.", safeError(phone))
		}

		account, status := call(url.PathEscape(str(c, "business_account_id")), "id,name,account_review_status")
		if status == 200 && str(account, "id") == str(c, "business_account_id") {
			state := "pass"
			message := "La cuenta de WhatsApp es accesible."

			if review := str(account, "account_review_status"); review != "" && review != "APPROVED" {
				state = "warning"
				message = "Revisión de la cuenta: " + review
			}

			add("account_access", "Cuenta de WhatsApp", state, message, nil)

			result["account_name"] = account["name"]
		} else {
			state := "fail"
			if status == 0 || status == 429 || status >= 500 {
				state = "unknown"
			}

			add("account_access", "Cuenta de WhatsApp", state, "No se pudo consultar la cuenta de WhatsApp.", safeError(account))
		}

		subscribed, status := call(url.PathEscape(str(c, "business_account_id"))+"/subscribed_apps", "")
		if status != 200 {
			add("webhook_subscription", "Suscripción de webhooks", "unknown", "No se pudo comprobar la suscripción.", safeError(subscribed))
		} else if s.Config.MetaAppID == "" {
			add("webhook_subscription", "Suscripción de webhooks", "unknown", "Configurá META_APP_ID para identificar la app suscrita.", nil)
		} else {
			found := false
			data, _ := subscribed["data"].([]any)

			for _, item := range data {
				o, _ := item.(map[string]any)
				if str(o, "id") == s.Config.MetaAppID || str(object(o, "whatsapp_business_api_data"), "id") == s.Config.MetaAppID {
					found = true
				}
			}

			if found {
				add("webhook_subscription", "Suscripción de webhooks", "pass", "La app está suscrita a la cuenta.", nil)
			} else {
				add("webhook_subscription", "Suscripción de webhooks", "fail", "La app no está suscrita. Reconectá el número.", nil)
			}
		}

		health, status := call(url.PathEscape(str(c, "external_id")), "health_status")
		if status == 200 && object(health, "health_status") != nil {
			h := object(health, "health_status")
			result["can_send_message"] = h["can_send_message"]
			addHealthChecks(h, add, billing)
		} else {
			add("messaging_health", "Capacidad de envío", "unknown", "Meta no devolvió el diagnóstico de envío.", safeError(health))
		}
	}

	// Callback verification is tracked separately from the WABA app subscription.
	saveCtx, saveCancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer saveCancel()

	var verificationRaw []byte

	err := lock.QueryRow(saveCtx, "SELECT data FROM resources WHERE project_id=$1 AND kind='meta_webhook_verification' AND id='current'", p).Scan(&verificationRaw)
	verification := store.Object{}

	if err == nil {
		err = json.Unmarshal(verificationRaw, &verification)
	}

	if err == nil {
		add("webhook_verification", "Verificación del webhook", "pass", "Meta verificó el callback del proyecto.", store.Object{"verified_at": verification["verified_at"]})
	} else if notFound(err) == store.ErrNotFound {
		add("webhook_verification", "Verificación del webhook", "unknown", "No hay una verificación registrada para este proyecto.", nil)
	} else {
		return nil, err
	}

	overall := "healthy"
	issues := 0

	for _, check := range checks {
		state := str(check, "status")
		if state == "fail" {
			overall = "error"
			issues++
		} else if state == "warning" {
			if overall != "error" {
				overall = "warning"
			}

			issues++
		} else if state == "unknown" && overall == "healthy" {
			overall = "unknown"
		}
	}

	result["checks"] = checks
	result["status"] = overall
	result["issues"] = issues
	result["checked_at"] = time.Now().UTC().Format(time.RFC3339Nano)

	saveTx, err := lock.Begin(saveCtx)
	if err != nil {
		return nil, err
	}
	defer saveTx.Rollback(context.Background())

	var liveToken string

	if e = saveTx.QueryRow(saveCtx, "SELECT data->>'access_token' FROM resources WHERE project_id=$1 AND kind='connections' AND id=$2 FOR SHARE", p, str(c, "id")).Scan(&liveToken); e != nil {
		return nil, notFound(e)
	}

	if liveToken != str(c, "access_token") {
		return nil, fmt.Errorf("connection credentials changed during health check")
	}

	raw, _ := json.Marshal(result)

	_, e = saveTx.Exec(saveCtx, "INSERT INTO resources(project_id,kind,id,data) VALUES($1,'connection_health',$2,$3) ON CONFLICT(project_id,kind,id) DO UPDATE SET data=EXCLUDED.data", p, str(c, "id"), raw)
	if e == nil {
		_, e = saveTx.Exec(saveCtx, "UPDATE resources SET data=data||jsonb_build_object('health_status',$3::text,'health_issues',$4::int,'health_checked_at',$5::text) WHERE project_id=$1 AND kind='connections' AND id=$2", p, str(c, "id"), overall, issues, str(result, "checked_at"))
	}

	if e != nil {
		return nil, e
	}

	return result, saveTx.Commit(saveCtx)
}

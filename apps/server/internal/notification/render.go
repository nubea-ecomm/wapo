package notification

import (
	"context"
	"errors"
	"fmt"
	"html"
	"net/url"
	"strings"
	"time"

	"wapo.local/server/internal/store"
)

var errInvitationUnavailable = errors.New("invitation is expired, accepted, or unavailable")

func render(ctx context.Context, s *store.Store, delivery queuedDelivery, publicURL string) (Message, error) {
	var projectName string

	if delivery.ProjectID != "" {
		if err := s.Pool.QueryRow(ctx, "SELECT name FROM projects WHERE id=$1", delivery.ProjectID).Scan(&projectName); err != nil {
			return Message{}, err
		}
	}

	subject, intro, details := "", "", ""

	switch delivery.Type {
	case "user_invitation":
		invitationID := text(delivery.Payload, "invitation_id", "")

		var available bool

		if err := s.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM console_user_invitations WHERE id=$1 AND accepted_at IS NULL AND expires_at>now())", invitationID).Scan(&available); err != nil {
			return Message{}, err
		}

		if !available {
			return Message{}, errInvitationUnavailable
		}

		token, err := s.Unseal(text(delivery.Payload, "invitation_token", ""), invitationID)

		if err != nil || token == "" {
			return Message{}, fmt.Errorf("cannot decrypt invitation token")
		}

		link := publicURL + "/#/accept-invitation?token=" + url.QueryEscape(token)
		projects := stringList(delivery.Payload["projects"])
		subject = "Te invitaron a Wapo"
		intro = "Te invitaron a un nuevo proyecto en Wapo."
		details = "Proyectos: " + strings.Join(projects, ", ") + "\nLa invitación vence en 7 días.\n\nAceptar invitación: " + link
		plain := "Hola " + text(delivery.Payload, "name", "") + ",\n\n" + intro + "\n\n" + details

		return Message{To: delivery.Recipients, Subject: subject, Text: plain, HTML: invitationHTML(text(delivery.Payload, "name", ""), projects, link)}, nil
	case "whatsapp_disconnected":
		subject = "WhatsApp requiere atención — " + projectName
		intro = "Una conexión de WhatsApp no está disponible."
		details = fmt.Sprintf("Conexión: %s\nProblemas detectados: %v", text(delivery.Payload, "connection_name", text(delivery.Payload, "connection_id", "Sin nombre")), delivery.Payload["issues"])
	case "customer_needs_attention":
		subject = "Customer necesita atención — " + projectName
		intro = "Detectamos un problema que requiere revisión."
		customer := text(delivery.Payload, "customer_id", "")

		if customer != "" {
			var customerName string

			if s.Pool.QueryRow(ctx, "SELECT name FROM customers WHERE project_id=$1 AND id=$2", delivery.ProjectID, customer).Scan(&customerName) == nil {
				customer = customerName + " (" + customer + ")"
			}
		} else {
			customer = "Sin asignar"
		}

		details = fmt.Sprintf("Customer: %s\nConexión: %s\nEstado: %s", customer, text(delivery.Payload, "connection_name", text(delivery.Payload, "connection_id", "Sin nombre")), text(delivery.Payload, "status", "unknown"))
	case "daily_stats", "weekly_stats":
		from, err := time.Parse(time.RFC3339, text(delivery.Payload, "from", ""))
		if err != nil {
			return Message{}, err
		}

		to, err := time.Parse(time.RFC3339, text(delivery.Payload, "to", ""))
		if err != nil {
			return Message{}, err
		}

		var outbound, inbound, delivered, read, failed int

		err = s.Pool.QueryRow(ctx, `SELECT count(*) FILTER(WHERE data->>'direction'='outbound'),count(*) FILTER(WHERE data->>'direction'='inbound'),count(*) FILTER(WHERE data->>'direction'='outbound' AND data->>'status' IN ('delivered','read')),count(*) FILTER(WHERE data->>'direction'='outbound' AND data->>'status'='read'),count(*) FILTER(WHERE data->>'direction'='outbound' AND data->>'status'='failed') FROM resources WHERE project_id=$1 AND kind='messages' AND created_at >= $2 AND created_at < $3`, delivery.ProjectID, from, to).Scan(&outbound, &inbound, &delivered, &read, &failed)
		if err != nil {
			return Message{}, err
		}

		period := from.Format("02 Jan 2006") + " — " + to.Add(-time.Nanosecond).Format("02 Jan 2006")

		if delivery.Type == "daily_stats" {
			subject, intro = "Resumen diario — "+projectName, "Estas son las estadísticas de ayer (UTC)."
		} else {
			subject, intro = "Resumen semanal — "+projectName, "Estas son las estadísticas de la última semana completa (UTC)."
		}

		details = fmt.Sprintf("Período: %s\nEnviados: %d\nRecibidos: %d\nEntregados: %d\nLeídos: %d\nFallidos: %d", period, outbound, inbound, delivered, read, failed)
	default:
		return Message{}, fmt.Errorf("unsupported notification type %s", delivery.Type)
	}

	console := publicURL
	plain := intro + "\n\n" + details + "\n\nAbrir Wapo: " + console
	body := html.EscapeString(details)
	body = replaceLines(body)
	htmlBody := `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:Arial,sans-serif;color:#18181b"><div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:28px"><div style="font-size:18px;font-weight:700;margin-bottom:18px">Wapo</div><h1 style="font-size:22px;margin:0 0 12px">` + html.EscapeString(subject) + `</h1><p style="color:#52525b">` + html.EscapeString(intro) + `</p><div style="line-height:1.8;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:16px">` + body + `</div><p style="margin-top:24px"><a href="` + html.EscapeString(console) + `" style="color:#18181b;font-weight:600">Abrir Wapo</a></p></div></body></html>`

	return Message{To: delivery.Recipients, Subject: subject, Text: plain, HTML: htmlBody}, nil
}

func stringList(value any) []string {
	items, _ := value.([]any)
	out := make([]string, 0, len(items))

	for _, item := range items {
		if value, ok := item.(string); ok {
			out = append(out, value)
		}
	}

	if len(out) == 0 {
		return []string{"Wapo"}
	}

	return out
}

func invitationHTML(name string, projects []string, link string) string {
	return `<!doctype html><html><body style="margin:0;background:#f6f6f6;font-family:Arial,sans-serif;color:#18181b"><div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:28px"><div style="font-size:18px;font-weight:700;margin-bottom:18px">Wapo</div><h1 style="font-size:22px;margin:0 0 12px">Te invitaron a Wapo</h1><p>Hola ` + html.EscapeString(name) + `,</p><p style="color:#52525b">Te invitaron a un nuevo proyecto en Wapo.</p><p><strong>Proyectos:</strong> ` + html.EscapeString(strings.Join(projects, ", ")) + `</p><p style="margin:28px 0"><a href="` + html.EscapeString(link) + `" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;border-radius:7px;padding:12px 18px;font-weight:600">Aceptar invitación</a></p><p style="font-size:12px;color:#71717a">Este enlace vence en 7 días y puede utilizarse una sola vez.</p></div></body></html>`
}

func text(payload store.Object, key, fallback string) string {
	if value, ok := payload[key].(string); ok && value != "" {
		return value
	}

	return fallback
}

func replaceLines(value string) string {
	result := ""

	for index, part := range splitLines(value) {
		if index > 0 {
			result += "<br>"
		}

		result += part
	}

	return result
}

func splitLines(value string) []string {
	lines := []string{""}

	for _, r := range value {
		if r == '\n' {
			lines = append(lines, "")
		} else {
			lines[len(lines)-1] += string(r)
		}
	}

	return lines
}

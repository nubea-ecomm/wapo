package notification

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"mime"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"time"
)

type Message struct {
	To      []string
	Subject string
	Text    string
	HTML    string
}

type Sender interface {
	Send(context.Context, Message) error
}

type SMTPConfig struct {
	Host, Username, Password, FromAddress, FromName, TLS string
	Port                                                 int
}

type SMTPSender struct{ Config SMTPConfig }

func (s SMTPSender) Send(ctx context.Context, message Message) error {
	if len(message.To) == 0 {
		return fmt.Errorf("notification has no recipients")
	}

	address := net.JoinHostPort(s.Config.Host, fmt.Sprint(s.Config.Port))
	dialer := net.Dialer{Timeout: 15 * time.Second}

	var (
		connection net.Conn
		err        error
	)

	tlsConfig := &tls.Config{MinVersion: tls.VersionTLS12, ServerName: s.Config.Host}

	if s.Config.TLS == "tls" {
		connection, err = tls.DialWithDialer(&dialer, "tcp", address, tlsConfig)
	} else {
		connection, err = dialer.DialContext(ctx, "tcp", address)
	}

	if err != nil {
		return err
	}

	defer connection.Close()

	deadline, ok := ctx.Deadline()
	if !ok {
		deadline = time.Now().Add(30 * time.Second)
	}

	_ = connection.SetDeadline(deadline)

	client, err := smtp.NewClient(connection, s.Config.Host)
	if err != nil {
		return err
	}
	defer client.Close()

	if s.Config.TLS == "starttls" {
		if supported, _ := client.Extension("STARTTLS"); !supported {
			return fmt.Errorf("SMTP server does not support STARTTLS")
		}

		if err = client.StartTLS(tlsConfig); err != nil {
			return err
		}
	}

	if s.Config.Username != "" {
		if ok, _ := client.Extension("AUTH"); !ok {
			return fmt.Errorf("SMTP server does not support authentication")
		}

		if err = client.Auth(smtp.PlainAuth("", s.Config.Username, s.Config.Password, s.Config.Host)); err != nil {
			return err
		}
	}

	if err = client.Mail(s.Config.FromAddress); err != nil {
		return err
	}

	for _, recipient := range message.To {
		if err = client.Rcpt(recipient); err != nil {
			return err
		}
	}

	w, err := client.Data()
	if err != nil {
		return err
	}

	if _, err = w.Write(buildMIME(s.Config, message)); err != nil {
		_ = w.Close()
		return err
	}

	return w.Close()
}

func buildMIME(config SMTPConfig, message Message) []byte {
	boundary := "wapo-notification-boundary"
	fromAddress := mail.Address{Name: cleanHeader(config.FromName), Address: config.FromAddress}
	from := fromAddress.String()
	toHeader := "undisclosed-recipients:;"

	if len(message.To) == 1 {
		toHeader = cleanHeader(message.To[0])
	}

	var out bytes.Buffer

	fmt.Fprintf(&out, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=%q\r\n\r\n", from, toHeader, mime.QEncoding.Encode("UTF-8", cleanHeader(message.Subject)), boundary)
	fmt.Fprintf(&out, "--%s\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n%s\r\n", boundary, message.Text)
	fmt.Fprintf(&out, "--%s\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n%s\r\n--%s--\r\n", boundary, message.HTML, boundary)

	return out.Bytes()
}

func cleanHeader(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "\r", ""), "\n", "")
}

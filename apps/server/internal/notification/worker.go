package notification

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

type queuedDelivery struct {
	ID, ProjectID, Type string
	Recipients          []string
	Payload             store.Object
	Attempts            int
}

func Run(ctx context.Context, s *store.Store, sender Sender, publicURL string) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	run := func() {
		workCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
		defer cancel()

		if sender == nil {
			return
		}

		if err := s.QueueScheduledNotifications(workCtx, time.Now()); err != nil && ctx.Err() == nil {
			slog.Error("email notification scheduling failed", "error", err)
		}

		for range 10 {
			delivery, ok, err := claim(workCtx, s)
			if err != nil || !ok {
				if err != nil && ctx.Err() == nil {
					slog.Error("email notification claim failed", "error", err)
				}

				return
			}

			message, err := render(workCtx, s, delivery, publicURL)
			if err == nil {
				err = sender.Send(workCtx, message)
			}

			finishCtx, finishCancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
			finishErr := finish(finishCtx, s, delivery, err)

			finishCancel()

			if finishErr != nil {
				slog.Error("email notification result persistence failed", "delivery", delivery.ID, "error", finishErr)
			}
		}
	}

	run()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			run()
		}
	}
}

func claim(ctx context.Context, s *store.Store) (queuedDelivery, bool, error) {
	delivery := queuedDelivery{}

	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return delivery, false, err
	}
	defer tx.Rollback(ctx)

	var raw []byte

	err = tx.QueryRow(ctx, `SELECT id,coalesce(project_id,''),notification_type,recipients,payload,attempts FROM notification_deliveries WHERE attempts<8 AND available_at<=now() AND (state='pending' OR (state='processing' AND lease_until<now())) ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`).Scan(&delivery.ID, &delivery.ProjectID, &delivery.Type, &delivery.Recipients, &raw, &delivery.Attempts)

	if err == pgx.ErrNoRows {
		return delivery, false, nil
	}

	if err != nil {
		return delivery, false, err
	}

	if err = json.Unmarshal(raw, &delivery.Payload); err != nil {
		return delivery, false, err
	}

	_, err = tx.Exec(ctx, "UPDATE notification_deliveries SET state='processing',attempts=attempts+1,lease_until=now()+interval '60 seconds',updated_at=now() WHERE id=$1", delivery.ID)
	if err != nil {
		return delivery, false, err
	}

	delivery.Attempts++

	return delivery, true, tx.Commit(ctx)
}

func finish(ctx context.Context, s *store.Store, delivery queuedDelivery, sendErr error) error {
	if sendErr == nil {
		_, err := s.Pool.Exec(ctx, "UPDATE notification_deliveries SET state='sent',lease_until=NULL,last_error='',payload=payload-'invitation_token',updated_at=now() WHERE id=$1", delivery.ID)
		return err
	}

	message := sendErr.Error()
	if len(message) > 600 {
		message = message[:600]
	}

	if delivery.Attempts >= 8 || errors.Is(sendErr, errInvitationUnavailable) {
		_, err := s.Pool.Exec(ctx, "UPDATE notification_deliveries SET state='failed',lease_until=NULL,last_error=$2,payload=payload-'invitation_token',updated_at=now() WHERE id=$1", delivery.ID, message)
		return err
	}

	delay := time.Duration(1<<min(delivery.Attempts, 6)) * time.Minute
	_, err := s.Pool.Exec(ctx, "UPDATE notification_deliveries SET state='pending',lease_until=NULL,last_error=$2,available_at=now()+$3::interval,updated_at=now() WHERE id=$1", delivery.ID, message, delay.String())

	return err
}

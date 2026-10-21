package api

import (
	"context"
	"time"

	"github.com/aarondl/authboss/v3"
	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

type authStorage struct{ tx pgx.Tx }

func (s authStorage) New(context.Context) authboss.User {
	return &authUser{ID: store.ID("user"), Active: true, RecoverExpiry: time.Now().UTC()}
}

func (s authStorage) Create(ctx context.Context, user authboss.User) error {
	u := user.(*authUser)
	result, err := s.tx.Exec(ctx, `INSERT INTO console_users(id,email,name,password_hash,role,all_projects,email_verified,language) VALUES($1,$2,$3,$4,'member',false,false,$5) ON CONFLICT(email) DO NOTHING`, u.ID, u.Email, u.Name, u.Password, u.Language)

	if err == nil && result.RowsAffected() == 0 {
		return authboss.ErrUserFound
	}

	return err
}

func (s authStorage) load(ctx context.Context, where, value string) (*authUser, error) {
	u := &authUser{}
	err := s.tx.QueryRow(ctx, `SELECT id,email,name,password_hash,active,email_verified,confirm_selector,confirm_verifier,recover_selector,recover_verifier,recover_expires_at FROM console_users WHERE `+where+` FOR UPDATE`, value).Scan(&u.ID, &u.Email, &u.Name, &u.Password, &u.Active, &u.Confirmed, &u.ConfirmSelector, &u.ConfirmVerifier, &u.RecoverSelector, &u.RecoverVerifier, &u.RecoverExpiry)

	if err == pgx.ErrNoRows {
		return nil, authboss.ErrUserNotFound
	}

	return u, err
}

func (s authStorage) Load(ctx context.Context, pid string) (authboss.User, error) {
	u, err := s.load(ctx, "email=$1", pid)
	if err == authboss.ErrUserNotFound {
		// Keep absent-account logins on the same password-hashing path.
		_ = authboss.NewBCryptHasher(12).CompareHashAndPassword("$2a$12$LXrCnzSg7Nk7dQ1aUEW3zOI/NpkfT.PKkFjPVVEhZv1uOGSso7/OW", "invalid")
	}

	return u, err
}

func (s authStorage) LoadByConfirmSelector(ctx context.Context, selector string) (authboss.ConfirmableUser, error) {
	return s.load(ctx, "confirm_selector=$1 AND confirm_selector<>'' AND confirm_expires_at>now()", selector)
}

func (s authStorage) LoadByRecoverSelector(ctx context.Context, selector string) (authboss.RecoverableUser, error) {
	return s.load(ctx, "recover_selector=$1 AND recover_selector<>'' AND active AND email_verified", selector)
}

func (s authStorage) Save(ctx context.Context, user authboss.User) error {
	u := user.(*authUser)
	// The row is locked by load (or newly inserted), so tokens are single-use
	// even when two replicas finish recovery/verification concurrently.
	_, err := s.tx.Exec(ctx, `DELETE FROM console_sessions WHERE user_id=$1 AND EXISTS(SELECT 1 FROM console_users WHERE id=$1 AND password_hash<>$2)`, u.ID, u.Password)
	if err != nil {
		return err
	}

	_, err = s.tx.Exec(ctx, `UPDATE console_users SET password_hash=$2,email_verified=$3,confirm_expires_at=CASE WHEN confirm_selector<>$4 THEN now()+interval '24 hours' ELSE confirm_expires_at END,confirm_selector=$4,confirm_verifier=$5,recover_selector=$6,recover_verifier=$7,recover_expires_at=$8 WHERE id=$1`, u.ID, u.Password, u.Confirmed, u.ConfirmSelector, u.ConfirmVerifier, u.RecoverSelector, u.RecoverVerifier, u.RecoverExpiry)

	return err
}

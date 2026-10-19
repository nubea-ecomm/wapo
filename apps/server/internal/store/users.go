package store

import (
	"context"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"golang.org/x/crypto/bcrypt"
)

type ConsoleUser struct {
	Role          string    `json:"role"`
	AllProjects   bool      `json:"all_projects"`
	ProjectIDs    []string  `json:"project_ids"`
	ID            string    `json:"id"`
	Email         string    `json:"email"`
	Name          string    `json:"name"`
	Language      string    `json:"language"`
	AvatarVariant int       `json:"avatar_variant"`
	Active        bool      `json:"active"`
	CreatedAt     time.Time `json:"created_at"`
}

func NormalizeEmail(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	parsed, e := mail.ParseAddress(email)

	if e != nil || parsed.Address != email {
		return "", fmt.Errorf("a valid email address is required")
	}

	return email, nil
}

func PasswordHash(password string) (string, error) {
	if len(password) < 12 || len(password) > 72 {
		return "", fmt.Errorf("password must contain between 12 and 72 bytes")
	}

	hash, e := bcrypt.GenerateFromPassword([]byte(password), 12)

	return string(hash), e
}

func (s *Store) CreateUser(ctx context.Context, email, name, password string) (ConsoleUser, error) {
	var user ConsoleUser

	email, e := NormalizeEmail(email)
	if e != nil {
		return user, e
	}

	name = strings.TrimSpace(name)
	if name == "" || len(name) > 120 {
		return user, fmt.Errorf("name must contain between 1 and 120 characters")
	}

	hash, e := PasswordHash(password)
	if e != nil {
		return user, e
	}

	e = s.Pool.QueryRow(ctx, "INSERT INTO console_users(id,email,name,password_hash) VALUES($1,$2,$3,$4) RETURNING id,email,name,active,created_at,role,all_projects,language,avatar_variant", ID("user"), email, name, hash).Scan(&user.ID, &user.Email, &user.Name, &user.Active, &user.CreatedAt, &user.Role, &user.AllProjects, &user.Language, &user.AvatarVariant)
	user.ProjectIDs = []string{}

	return user, e
}

func (s *Store) BootstrapUser(ctx context.Context, email, password string) error {
	normalized, e := NormalizeEmail(email)
	if e != nil {
		return e
	}

	var exists bool

	if e = s.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM console_users)").Scan(&exists); e != nil {
		return e
	}

	if exists {
		return nil
	}

	_, e = s.CreateUser(ctx, normalized, "Administrador local", password)
	if e != nil {
		var created bool

		if check := s.Pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM console_users WHERE email=$1)", normalized).Scan(&created); check == nil && created {
			return nil
		}
	}

	return e
}

func (s *Store) AuthenticateSession(ctx context.Context, token string) (ConsoleUser, error) {
	var user ConsoleUser

	e := s.Pool.QueryRow(ctx, `SELECT u.id,u.email,u.name,u.active,u.created_at,u.role,u.all_projects,ARRAY(SELECT project_id FROM console_user_projects WHERE user_id=u.id ORDER BY project_id),u.language,u.avatar_variant FROM console_sessions s JOIN console_users u ON u.id=s.user_id WHERE s.hash=$1 AND s.expires_at>now() AND u.active`, Hash(token)).Scan(&user.ID, &user.Email, &user.Name, &user.Active, &user.CreatedAt, &user.Role, &user.AllProjects, &user.ProjectIDs, &user.Language, &user.AvatarVariant)

	return user, e
}

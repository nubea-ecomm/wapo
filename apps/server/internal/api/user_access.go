package api

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"wapo.local/server/internal/store"
)

type userAccess struct {
	Role     string
	All      bool
	Projects []string
}

func parseUserAccess(input store.Object, current userAccess) (userAccess, error) {
	if value, ok := input["role"]; ok {
		role, valid := value.(string)
		if !valid || (role != "admin" && role != "member" && role != "billing" && role != "viewer") {
			return current, fmt.Errorf("role must be admin, member, billing or viewer")
		}

		current.Role = role
	}

	if value, ok := input["all_projects"]; ok {
		all, valid := value.(bool)
		if !valid {
			return current, fmt.Errorf("all_projects must be a boolean")
		}

		current.All = all
	}

	if value, ok := input["project_ids"]; ok {
		values, valid := value.([]any)
		if !valid || len(values) > 500 {
			return current, fmt.Errorf("project_ids must contain up to 500 project IDs")
		}

		seen := map[string]bool{}
		current.Projects = []string{}

		for _, value := range values {
			id, valid := value.(string)
			if !valid || id == "" {
				return current, fmt.Errorf("project_ids must contain project IDs")
			}

			if !seen[id] {
				current.Projects = append(current.Projects, id)
				seen[id] = true
			}
		}
	}

	if current.All {
		current.Projects = []string{}
	}

	return current, nil
}

func saveUserAccess(ctx context.Context, tx pgx.Tx, id string, access userAccess) error {
	var count int

	if e := tx.QueryRow(ctx, "SELECT count(*) FROM projects WHERE id=ANY($1)", access.Projects).Scan(&count); e != nil {
		return e
	}

	if count != len(access.Projects) {
		return fmt.Errorf("one or more projects do not exist")
	}

	if _, e := tx.Exec(ctx, "UPDATE console_users SET role=$2,all_projects=$3 WHERE id=$1", id, access.Role, access.All); e != nil {
		return e
	}

	// Explicit operator assignments supersede previously offered access as well.
	if _, e := tx.Exec(ctx, `UPDATE project_invitations SET expires_at=LEAST(expires_at,now()) WHERE email=(SELECT email FROM console_users WHERE id=$1) AND accepted_at IS NULL`, id); e != nil {
		return e
	}

	if _, e := tx.Exec(ctx, "DELETE FROM console_user_projects WHERE user_id=$1", id); e != nil {
		return e
	}

	for _, project := range access.Projects {
		if _, e := tx.Exec(ctx, "INSERT INTO console_user_projects(user_id,project_id,role) VALUES($1,$2,$3)", id, project, access.Role); e != nil {
			return e
		}
	}

	return nil
}

const selectUser = `SELECT u.id,u.email,u.name,u.active,u.created_at,u.role,u.all_projects,ARRAY(SELECT project_id FROM console_user_projects WHERE user_id=u.id ORDER BY project_id),u.language,u.avatar_variant,EXISTS(SELECT 1 FROM console_user_invitations invitation WHERE invitation.user_id=u.id AND invitation.accepted_at IS NULL AND invitation.expires_at>now()) FROM console_users u`

func scanUser(row pgx.Row) (store.ConsoleUser, error) {
	var u store.ConsoleUser

	e := row.Scan(&u.ID, &u.Email, &u.Name, &u.Active, &u.CreatedAt, &u.Role, &u.AllProjects, &u.ProjectIDs, &u.Language, &u.AvatarVariant, &u.InvitationPending)

	return u, e
}

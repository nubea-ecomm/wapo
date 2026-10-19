package api

import (
	"net/http"

	"wapo.local/server/internal/store"
)

func (s *Server) users(w http.ResponseWriter, r *http.Request, id string) {
	switch {
	case r.Method == "GET" && id == "":
		rows, e := s.Store.Pool.Query(r.Context(), selectUser+" ORDER BY u.created_at DESC")
		if e != nil {
			dbError(w, e)
			return
		}
		defer rows.Close()

		users := []store.ConsoleUser{}

		for rows.Next() {
			var u store.ConsoleUser

			if e = rows.Scan(&u.ID, &u.Email, &u.Name, &u.Active, &u.CreatedAt, &u.Role, &u.AllProjects, &u.ProjectIDs, &u.Language, &u.AvatarVariant, &u.InvitationPending); e != nil {
				dbError(w, e)
				return
			}

			users = append(users, u)
		}

		if rows.Err() != nil {
			dbError(w, rows.Err())
			return
		}

		write(w, 200, store.Object{"data": users})
	case r.Method == "POST" && id == "":
		s.createConsoleUser(w, r)
	case r.Method == "DELETE" && id != "":
		s.deleteUser(w, r, id)
	case r.Method == "PATCH" && id != "":
		s.updateUser(w, r, id)
	default:
		fail(w, 405, "method_not_allowed", "Use GET, POST, PATCH or DELETE")
	}
}

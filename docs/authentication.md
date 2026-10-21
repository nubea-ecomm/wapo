# Accounts and authentication

Wapo uses Authboss v3 for registration, password authentication, email confirmation,
password recovery and password changes. Wapo supplies PostgreSQL storage, JSON
adapters, the React UI, project authorization and its durable email transport.
Authboss is a library inside the existing Go API; no separate identity service is
required.

## Public signup

1. Configure SMTP in the API and worker. Set the first `WEB_ORIGIN` entry to the
   public console origin; authentication emails link to this origin, never an
   untrusted request header.
2. Open **Create account** on the sign-in page and enter name, email and password.
3. Open the verification email and explicitly confirm. The single-use link expires
   after 24 hours. **Resend verification** issues a replacement.
4. Sign in and create the first project. Project creation and its administrator
   membership commit together. Users can create additional projects in Projects.

Public registration is available when SMTP is configured. Without SMTP, the
authentication email routes return `503 email_unavailable`; bootstrap and existing
account login continue to work. No test sends real email: tests inspect the encrypted
outbox or use a fake sender.

## Passwords, sessions and profile

Existing user IDs, bcrypt cost-12 hashes and sessions are preserved. The migration
marks existing accounts as verified; new registrations explicitly start unverified.
Passwords contain 12–72 UTF-8 bytes. Global operators retain the existing manual
user management and invitation flows.

Password recovery links expire in one hour, are single-use and are invalidated by
replacement requests. Unknown, disabled and unverified accounts receive the same
accepted recovery response. Resetting or changing a password revokes every session
in the same transaction. **Account security** lists active sessions, supports
individual revocation and allows password changes after checking the current password.

The existing opaque bearer-session contract is retained for the SDK and console:
tokens are hashed in PostgreSQL, expire after 12 hours, and are stored in browser
sessionStorage (or localStorage with Remember me). Cookie sessions, social login,
passkeys and MFA are not enabled by this integration.

Profile name, language and avatar remain editable. Scoped users cannot change their
sign-in email via profile PATCH; an operator must manage email changes. Global
operators can use `PATCH /admin/v1/users/{id}` with `email` after verifying the new
address themselves; this revokes existing sessions and verification/recovery links.
Pending account invitations must be completed or replaced first. Global
operators retain their existing profile-email behavior. This prevents a public
account from bypassing email verification by changing its email after signup.

## Projects and team invitations

Global administration remains separate from project administration. A public user
starts with `all_projects=false` and no memberships. Creating a project grants
`admin` only on that project, never `/admin/v1/users` or platform settings.

Each `console_user_projects` row has an independent `admin`, `member`, `viewer` or
`billing` role. The console profile exposes `project_roles`. Both backend requests
and frontend capabilities use the selected project's role. Existing assignments
are migrated with their previous role, preserving access.

Project administrators use **Team** to invite, change roles or remove memberships.
Invitations expire after seven days and must be accepted by a signed-in, verified
account with the exact invited email. A new recipient registers first and reopens
the invitation after verification. Existing accounts retain their password and
other memberships. Accepting an invitation cannot replace an existing membership's
role. The final active project administrator cannot be removed or demoted through
the team API. Global operators can still deactivate accounts administratively.

## Transactions and limits

All Authboss mutations run in a PostgreSQL transaction. Confirmation/recovery
selectors are indexed, verifiers are compared by Authboss, and row locks prevent
concurrent token replay. Authboss mail runs synchronously into an encrypted outbox;
its mailer adapter propagates queue failures to the enclosing transaction. Workers
send asynchronously and remove encrypted email bodies on success or final failure.
Encryption-key rotation includes these queued messages.

Authentication flows share the PostgreSQL-backed source-IP quota configured by
`LOGIN_RATE_LIMIT_PER_MINUTE`. Configure production edge limits as appropriate.
Authboss diagnostic messages containing addresses/tokens are suppressed; API errors
retain request IDs. Project member mutations use the normal project request logging.

See the OpenAPI contract for `/auth/v1/*` and `/v1/members*` request/response schemas.

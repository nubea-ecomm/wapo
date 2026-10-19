# Email notifications

Wapo sends operational alerts and periodic project summaries through SMTP. The
same adapter supports a conventional SMTP provider and the Amazon SES SMTP
interface. SMTP credentials are deployment-level secrets; project recipients and
notification switches are stored in PostgreSQL.

## Configure SMTP

Add the following values to the server environment and restart the worker:

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USERNAME=<smtp-username>
SMTP_PASSWORD=<smtp-password>
SMTP_FROM_ADDRESS=notifications@example.com
SMTP_FROM_NAME=Wapo
SMTP_TLS=starttls
```

`SMTP_TLS` accepts:

- `starttls` (recommended, normally port 587);
- `tls` for implicit TLS (normally port 465);
- `none` only for a trusted local development SMTP server.

Credentials never appear in the API or console. Store them in the deployment's
secret manager, not in source control or a `VITE_*` variable.

Apply the configuration:

```bash
docker compose up -d --build migrate api worker
```

## Amazon SES

Create SMTP credentials in the same AWS Region as the SES endpoint. AWS access
keys are not SES SMTP credentials and cannot be used in their place.

```env
SMTP_HOST=email-smtp.us-east-1.amazonaws.com
SMTP_PORT=587
SMTP_USERNAME=<ses-smtp-username>
SMTP_PASSWORD=<ses-smtp-password>
SMTP_FROM_ADDRESS=notifications@example.com
SMTP_FROM_NAME=Wapo
SMTP_TLS=starttls
```

Verify `SMTP_FROM_ADDRESS` (or its domain) in SES. While the SES account is in the
sandbox, destination addresses must also be verified. Request production access
before sending normal project notifications.

## Project preferences and recipients

Open **Console → Configuration → Notifications**. A project administrator can
enable or disable:

- WhatsApp disconnected or unavailable;
- customer needs attention;
- daily statistics for the previous UTC day;
- weekly statistics for the last complete UTC week.

The recipient field suggests active console users with access to the selected
project. Select a suggestion or enter any valid external email and press Enter or
comma. Up to ten explicit addresses can be saved.

When the explicit recipient list is empty, Wapo resolves every active console user
who currently has access to the project. This includes users assigned directly and
users with all-project access. Resolution happens when the notification is queued,
so later membership changes do not rewrite an existing delivery.

## Delivery behavior

Notifications use a PostgreSQL outbox. Health alerts are queued in the same
transaction as the connection diagnosis. Scheduled reports are deduplicated by UTC
period. The worker claims jobs with a lease and retries failures up to eight times
with backoff.

SMTP delivery is at least once. A worker crash after the SMTP server accepts a
message but before PostgreSQL records success can produce a duplicate. Completed
deliveries are retained for 30 days and failed deliveries for 90 days.

Connection health transitions are deduplicated per connection and UTC day to avoid
repeated alert noise. An empty resolved audience creates no delivery.

## Member invitations

When SMTP is configured, **Console → Users → Invite user** creates an inactive
account and queues an invitation email instead of asking an administrator to choose
someone else's password. The email contains a single-use **Accept invitation** link
that expires after seven days. The invited person uses the public page to create a
12–72 character password; only then is the account activated.

Invitation tokens are high entropy. PostgreSQL stores their hash for validation and
an encrypted copy only while the durable email delivery needs it. The raw token is
not returned by the administration API. Accepting an invitation marks it used and
revokes any pre-existing sessions for that account.

When SMTP is not configured, Wapo preserves the local/bootstrap workflow: the
administrator must set an initial password and the account is activated immediately.

## Troubleshooting

- Check that the worker process is running and `SMTP_HOST` is present there, not
  only in the API process.
- Use `SMTP_TLS=starttls` for SES port 587 and confirm outbound network access.
- Confirm sender/domain verification, SES Region and sandbox status.
- Run `docker compose run --rm api operations` and inspect
  `failed_notifications`.
- Review worker logs for authentication, TLS and recipient rejection errors. Error
  text is truncated and credentials are never persisted in the outbox.
- If an invitation is unavailable, confirm that it is less than seven days old and
  has not already been accepted. Delete and recreate the pending user to issue a new
  invitation in the current release.

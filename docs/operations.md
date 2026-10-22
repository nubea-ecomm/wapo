# Operations

## Console origins and CORS

Set the canonical public API address explicitly on both API and worker:

```env
PUBLIC_URL=https://api.getwapo.dev
```

Build the hosted console with `VITE_API_URL=https://api.getwapo.dev`. On Unbroker,
use this literal custom domain rather than `${{services.wapo-backend.url}}`, which
resolves to the platform-generated hostname. Changing the frontend variable
requires rebuilding the frontend; API/worker variables require redeployment.
The custom domain must have active DNS and TLS before switching these values.
Previously saved console sessions using a different API URL require a new login
after the updated frontend loads. Tokens are not forwarded across API origins.

For the hosted console, configure the API with:

```env
WEB_ORIGIN=https://console.getwapo.dev
CORS_ORIGINS=https://getwapo.dev,https://*.getwapo.dev
```

`WEB_ORIGIN` is also the canonical console address used in authentication emails
(the first entry when multiple exact origins are listed). `CORS_ORIGINS` adds
cross-origin access and defaults to the apex and HTTPS subdomains of `getwapo.dev`.
Override it with a comma-separated allowlist for other deployments. A wildcard
matches complete subdomain labels, including nested subdomains, on the specified
scheme and port; list an apex domain separately. Exact `WEB_ORIGIN` entries and
same-port local HTTP loopback aliases remain supported.

Deploy the updated API and restart after environment changes. An `OPTIONS`
request to `/auth/v1/login` with `Origin: https://console.getwapo.dev` must return
204 and `Access-Control-Allow-Origin: https://console.getwapo.dev`. CORS headers
come from the API, so changing only the frontend build does not apply this fix.

Wapo stores durable application state in PostgreSQL. Production deployments must
provide encrypted backups, monitoring, HTTPS termination and an edge rate limiter.
The Compose commands below are local reference procedures; adapt them to the
managed database and secret manager used by the deployment.

## Backup and restore

Create a PostgreSQL custom-format backup and immediately prove that it can be
restored into a disposable database:

```bash
scripts/backup.sh
scripts/verify-backup.sh artifacts/backups/wapo-YYYYMMDDTHHMMSSZ.dump
```

Store backups outside the application host, encrypt them at rest and test a
restore on a schedule. A real restore is destructive. Stop API and worker
processes, take a final backup and then run:

```bash
docker compose stop api worker
CONFIRM_RESTORE=wapo scripts/restore.sh path/to/backup.dump
docker compose run --rm migrate
docker compose up -d api worker
```

## Credential encryption-key rotation

`ENCRYPTION_KEY` protects Meta access tokens, registration PINs, setup-link
tokens, pending invitation email tokens and webhook signing secrets. Back it up separately from PostgreSQL. To
rotate it without exposing plaintext:

1. Stop every API and worker replica.
2. Create and verify a database backup.
3. Keep the current `ENCRYPTION_KEY` configured and generate a new 32-byte key.
4. Run the atomic rotation command.
5. Replace `ENCRYPTION_KEY` with the new value and remove `NEW_ENCRYPTION_KEY`.
6. Restart all replicas and validate connection health and webhook delivery.

```bash
export NEW_ENCRYPTION_KEY="$(openssl rand -base64 32)"
docker compose run --rm -e NEW_ENCRYPTION_KEY api rotate-encryption-key
# Persist NEW_ENCRYPTION_KEY as ENCRYPTION_KEY in the deployment secret manager.
unset NEW_ENCRYPTION_KEY
```

Any unreadable credential aborts and rolls back the complete transaction. Do not
run old- and new-key replicas at the same time.

## Monitoring and alerts

Collect structured process logs and alert on:

- readiness failures and database-pool exhaustion;
- `request log queue full` and request-log persistence failures;
- webhook deliveries reaching `failed`;
- unresolved idempotency journals approaching 90 days;
- connection-health errors and expired provider credentials;
- repeated worker restarts or maintenance failures.
- email notification deliveries reaching `failed`.

Use `/healthz` only for process liveness and `/readyz` for traffic readiness.
Request IDs connect API responses, request logs and administrative audit records.
The offline command below emits machine-readable queue and credential counters
without exposing tenant payloads or secrets:

```bash
docker compose run --rm api operations
```

## Email notifications

The worker sends project notifications through SMTP. Configure `SMTP_HOST`,
`SMTP_PORT`, `SMTP_FROM_ADDRESS` and, when required, `SMTP_USERNAME` and
`SMTP_PASSWORD`. `SMTP_TLS=starttls` is the recommended default. Credentials stay
in the deployment secret manager and are never stored in PostgreSQL or returned by
the API.

Amazon SES is supported through its SMTP interface: use the regional endpoint
(for example `email-smtp.us-east-1.amazonaws.com`), port 587, STARTTLS and
region-specific **SMTP credentials** (not an AWS access key). Verify the sender in
SES and move the account out of the SES sandbox before sending to unverified
recipients.

When SMTP is configured, new console users are created as inactive invitations.
The worker sends a seven-day, single-use acceptance link so the recipient can set
their own password. Without SMTP, administrators must continue supplying an initial
password when creating the user.

Recipients and per-project switches are managed in Console → Configuration →
Notifications. When no explicit recipient is configured, each delivery resolves all
active console users with access to that project. The PostgreSQL outbox retries temporary failures up to eight times;
delivery is at least once, so a crash immediately after SMTP acceptance can produce
a duplicate. Daily and weekly periods use UTC.

## Release and rollback

### Separate services on Unbroker

Build both backend services from the repository root (not `apps/server`):

| Service | Dockerfile                      | Runtime                                           |
| ------- | ------------------------------- | ------------------------------------------------- |
| API     | `apps/server/Dockerfile`        | Migrate, then run `wapo` on port 8080             |
| Worker  | `apps/server/Dockerfile.worker` | Migrate, then run `wapo worker`; no HTTP listener |

Select the Worker category for the worker. Leave the platform start-command
override empty: the images include their own startup commands. Configure
`DATABASE_URL` and the same stable `ENCRYPTION_KEY` on both services, along with
their bootstrap and integration settings. PostgreSQL must be reachable at startup.

The shared `apps/server/docker-entrypoint.sh` runs `wapo migrate` before starting
the API or worker. A migration failure stops startup. The migration runner uses a
PostgreSQL transaction-level advisory lock, so simultaneous starts serialize schema
updates and skip already-applied migrations. The final `exec` forwards container
signals directly to Wapo. One-off commands such as `migrate`, `secrets`,
`operations` and `rotate-encryption-key` run directly without an extra migration.

Deploy the API and worker from the same release. Startup migrations do not replace
schema compatibility planning: existing replicas can still be running while the
new release migrates. The local Compose migration service remains compatible.

Deploy an immutable image to a small canary first. Migrations are forward-only,
transactional and checksum-protected. Before rollout, confirm that the previous
application version can run against the migrated schema. Roll application images
back independently; restore PostgreSQL only for disaster recovery, not ordinary
application rollback.

Run the repository load profile against a disposable project and set deployment
thresholds for error rate and p95 latency before increasing canary traffic.

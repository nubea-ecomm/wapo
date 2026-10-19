# Contributing

Use English for identifiers, comments, API errors and technical documentation.
Spanish belongs in the console's current user-facing copy. Keep API changes,
OpenAPI and operational docs in the same change.

Keep modules focused: one screen/component, endpoint concern or protocol adapter
per file. Prefer files under roughly 200 lines; split by responsibility rather
than introducing generic utility folders. Do not spread a single rule into many
files merely to hit a line count. Add connectors behind `channel.Connector` and
keep provider payloads outside the core conversation model.

Run `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`,
`make test-integration` and the relevant contract/browser checks. Use `make fmt-go`
for Go formatting and `go vet ./...` for Go diagnostics. CI repeats these checks.

Tests should cover behavior: tenant isolation, secret handling, idempotency,
provider failure boundaries, schema compatibility and critical user actions. Avoid
tests that merely duplicate implementation. Never call a real messaging provider
from an automated test; use fake Meta/upstream endpoints.

Do not commit `.env`, API keys, tokens, personal conversation content or browser
artifacts. Generated sample keys are test-only. The local console has no saved
password store. A production deployment needs its own HTTPS, edge rate limiter,
backups and provider approvals.

Migrations live under `apps/server/migrations`. Add a new numbered SQL file for
schema changes; applied checksums are immutable. Test against PostgreSQL rather
than an in-memory substitute for database-specific behavior.

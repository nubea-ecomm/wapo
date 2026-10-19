# Contributing

Use English for identifiers, comments, API errors and technical documentation.
Spanish belongs in the console's current user-facing copy. Keep API changes,
OpenAPI and operational docs in the same change.

Use Conventional Commit prefixes for SDK changes: `fix:` for patches, `feat:`
for minor releases and a `!` or `BREAKING CHANGE:` footer for major releases.
Release Please updates `packages/sdk/package.json` and its changelog; do not bump
the SDK version manually.

Keep modules focused: one screen/component, endpoint concern or protocol adapter
per file. Prefer files under roughly 200 lines; split by responsibility rather
than introducing generic utility folders. Do not spread a single rule into many
files merely to hit a line count. Add connectors behind `channel.Connector` and
keep provider payloads outside the core conversation model.

Run `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`,
`make test-integration` and the relevant contract/browser checks. Use `make fmt-go`
for Go formatting and `go vet ./...` for Go diagnostics. CI repeats these checks.

## SonarCloud

The `SonarCloud` workflow analyzes pushes to `main` and pull requests, including
Go and web test coverage. To activate it, import this public repository into the
`nubea-ecomm` organization on SonarCloud with project key `nubea-ecomm_wapo`,
disable SonarCloud automatic analysis, and add an analysis token as the
`SONAR_TOKEN` GitHub Actions repository secret. Until that secret exists, the
workflow reports a warning and skips the external scan instead of failing pull
requests.

The scanner configuration lives in `sonar-project.properties`. Keep its source,
test and coverage paths aligned when moving packages or changing test runners.

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

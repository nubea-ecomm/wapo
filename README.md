<p align="center">
  <img src="apps/web/public/favicon.svg" alt="Wapo logo" width="96" height="96">
</p>

<h1 align="center">Wapo</h1>

<p align="center">
  <a href="https://www.npmjs.com/package/@nubea-ecomm/wapo-sdk"><img src="https://img.shields.io/npm/v/%40nubea-ecomm%2Fwapo-sdk?label=Wapo%20SDK&color=171717" alt="Wapo SDK version"></a>
</p>

Open source messaging infrastructure with a public API, customer onboarding and a
multi-tenant management console. Go + PostgreSQL + React/Vite + TypeScript.

Developer preview. The repository is runnable and tested locally; it is not a
complete hosted messaging-platform replacement or a deployed public cloud service.

## Start locally

Requirements: Docker Compose, Node.js 22.12+ and pnpm 11.5.2. Go 1.26 is optional
when using the container commands.

```bash
cp .env.example .env
make secrets
# Copy the generated bootstrap/encryption values into .env.
# Generate a password and set it as ADMIN_PASSWORD (12–72 bytes):
openssl rand -base64 24
# ADMIN_EMAIL defaults to admin@wapo.local. ADMIN_API_KEY is optional technical access.
pnpm install
make up
pnpm dev
```

- Console: http://localhost:5173 (also http://127.0.0.1:5173)
- API: http://localhost:8080
- Public reference: http://localhost:8080/docs
- OpenAPI: http://localhost:8080/openapi.json
- Readiness: http://localhost:8080/readyz

For a production-built local console instead of Vite, use
`docker compose --profile dashboard up --build -d` and open the same port 5173.

Sign in with ADMIN_EMAIL and ADMIN_PASSWORD. The first administrator is created
once at startup; later password changes happen in the Users screen. Other
administrators are created from inside the console. API keys are generated from
the API keys screen after selecting a tenant. The login asks for email and password.
Sessions survive refresh in the current tab; “Recordarme” also retains the session
across browser restarts. Sessions expire after 12 hours and are revoked on logout
or password reset.
No credentials are committed. Local `.env` is ignored by Git.

The operator creates/renames/suspends tenants and issues/revokes project keys.
Select an active tenant to manage its customers, channels, conversations, keys,
webhooks and events. Suspending a tenant blocks API access but continues accepting
provider webhooks to preserve incoming data.

## Included

- Eleven console screens: overview, tenants, users, customers, contacts, chats,
  channels, API keys, webhooks, activity and configuration.
- Administrator email/password login, bcrypt password hashes, revocable sessions,
  SMTP member invitations, account activation/deactivation and password reset from
  the console.
- Customer external IDs, metadata, editing and deletion guards.
- Dedicated WhatsApp and Business App Coexistence hosted onboarding, temporary
  links, encrypted credentials, Meta callback verification and sync requests.
- WhatsApp is the only channel enabled in this deployment, including sends/templates through Meta.
- Connection details include an editable Meta-authoritative WhatsApp Business
  profile for About, description, address, email, category and websites.
- Persistent conversations, contact identity per channel, assignment labels,
  close/reopen, replies, history and five-second console polling.
- Typed WhatsApp contacts, custom properties, provider-synchronized marketing
  preferences, pre-send suppression and permanent local erasure.
- Native `/v1`, operator `/admin/v1`, compatibility `/platform/v1` and
  `/meta/whatsapp` APIs, project isolation, request IDs and idempotency journals.
- Durable signed webhook outbox, retries, failed-delivery inspection and manual retry.
- Project email alerts and daily/weekly summaries through SMTP or Amazon SES SMTP,
  with durable retries and configurable notification switches.
- TypeScript SDK, OpenAPI reference and optional project-scoped upstream bridge.
- Prettier, ESLint, TypeScript checks, Go unit/integration tests, frontend tests,
  upstream API contracts and Playwright management-flow tests.

The console's visual reference is [Mailcheap](https://github.com/marclou/mailcheap):
white surfaces, a light sidebar, Geist type, quiet borders and restrained tables.
Wapo's implementation is original; no Mailcheap application source is included.

## Public API example

```bash
export WAPO_URL=http://localhost:8080
export WAPO_API_KEY='<your-project-key>'
curl "$WAPO_URL/v1/customers" \
  -H "X-API-Key: $WAPO_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Example store","external_customer_id":"store-123"}'
```

The native API is independent of channel providers. An operator can explicitly
scope native requests using ADMIN_API_KEY plus X-Tenant-ID. Never put the operator
key in an application integration or distributed frontend build.

## API compatibility and Meta setup

The [public operation inventory](docs/api-compatibility.json) tracks all 195
operations from the reference API. Read [compatibility status](docs/api-compatibility.md)
for implemented routes, contract differences and pending services. Full parity is
not implemented.

See [upstream compatibility](docs/upstream-compatibility.md) for the integration,
environment variables, tests and migration boundaries.

Start with [Meta activation checklist](docs/meta-activation.md) for dashboard links,
Tech Provider enrollment, self-hosted versus hosted responsibilities, App Review
forms, recordings and real-account validation.

See [WhatsApp onboarding](docs/whatsapp-onboarding.md) for own Meta app requirements,
Coexistence behavior and the distinction between local contract tests and real
Meta acceptance. Connection diagnostics and credential renewal are available.
Carrier provisioning, shared Meta billing and resumable media ingest remain unsupported.
The optional bridge preserves these operations through an existing upstream account;
it does not migrate its resources into Wapo.

A webchat connector remains internal to connector tests and is disabled in the
public deployment. A public visitor widget and visitor-session authentication
remain to be built. AI workflows, campaigns and team-level routing remain future work.
Assignment labels are plain text, not user memberships.

## Repository

```text
apps/server/          Go API, workers, migrations and backend tests
apps/web/             React management console, components and frontend tests
packages/sdk/         Typed native/operator clients
packages/openapi/     Public API contract
scripts/              Contract and specification validation
tests/e2e/           Real-browser management workflow
docs/                Architecture, Meta setup and upstream compatibility
```

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
make lint-go             # Go formatting and logical whitespace checks.
make test-go             # Unit tests; database integration tests skip without TEST_DATABASE_URL.
make test-integration    # Requires the local Compose PostgreSQL service.
pnpm test:contract      # Requires built wapo-api image and local Compose PostgreSQL.
pnpm test:e2e           # Requires running API + local .env and full request logging; starts Vite automatically.
```

Set `REQUEST_LOG_SAMPLE_RATE=1` and `LOGIN_RATE_LIMIT_PER_MINUTE=100` for the
end-to-end suite because it verifies a specific successful request record and
performs several independent sign-in workflows from one test runner.

The reproducible k6 workload mixes 80% lightweight authenticated reads with 20%
message-history queries. Point it at a disposable project; arrival rate and duration
are configurable without editing the script:

```bash
BASE_URL=http://localhost:8080 API_KEY='<project-key>' \
  RATE=1000 DURATION=30s k6 run tests/load/public-api.js
```

Playwright uses Chrome on macOS by default when available. On Linux/CI install
Chromium with `pnpm exec playwright install --with-deps chromium`; the configuration
then uses Playwright's bundled browser. Set CHROME_PATH to use another executable.
Browser artifacts go in ignored `artifacts/` and `test-results/` directories.

A fresh test database is recommended for integration checks. Compose exposes
PostgreSQL only on 127.0.0.1:54329 and preserves it in a named volume. `make down`
stops services without deleting data. Migrations are numbered, transactional,
checksum-checked and applied once. Do not edit an applied migration.

[Architecture and limitations](docs/architecture.md) / [Operations](docs/operations.md) / [Email notifications](docs/email-notifications.md) / [WhatsApp Business profile](docs/whatsapp-business-profile.md) / [Contacts and consent](docs/contacts-and-consent.md) / [Contributing](CONTRIBUTING.md)

Apache-2.0 licensed. External providers retain their own fees and requirements.

## JavaScript and TypeScript SDK

The public SDK package is `@nubea-ecomm/wapo-sdk`. It requires Node.js 18 or
newer, or a modern browser with `fetch` and `AbortSignal.timeout`.

Install it with your preferred package manager:

```bash
npm install @nubea-ecomm/wapo-sdk
# or: pnpm add @nubea-ecomm/wapo-sdk
# or: yarn add @nubea-ecomm/wapo-sdk
```

Create a client using your Wapo API URL and a project API key:

```ts
import { WapoClient } from '@nubea-ecomm/wapo-sdk'

const wapo = new WapoClient({
  baseUrl: 'https://api.example.com',
  apiKey: process.env.WAPO_API_KEY!,
})
```

See the [SDK guide](packages/sdk/README.md) for usage, error handling and sending
messages. Never expose a project or operator API key in browser code.

SDK versions and changelogs are automated with Release Please. Conventional
`fix:` commits produce patches, `feat:` commits produce minor releases, and
breaking changes produce major releases. Release Please maintains a release PR;
merging it creates the matching `sdk-v<package-version>` GitHub release and
triggers `.github/workflows/publish-sdk.yml`. The release PR uses a fine-grained
`RELEASE_PLEASE_TOKEN` limited to this repository because the organization blocks
PR creation by the default Actions token. npm publication uses Trusted Publishing
with automatic provenance and no npm token. The publishing workflow rejects tags
that do not exactly match `packages/sdk/package.json` or commits not contained in
`main`.

Console user sessions survive refresh in the same browser tab until their 12-hour
expiry or logout. The tab stores the session token and selected tenant in
`sessionStorage`, or `localStorage` when “Recordarme” is checked; passwords and
technical API keys are never persisted. The server still expires sessions after
12 hours.

The console uses shadcn/ui (New York / neutral), Radix primitives and Tailwind
CSS v4. Components live in `apps/web/src/components/ui`; add them using
`pnpm dlx shadcn@latest add <component>` from `apps/web`. Activity charts use
Recharts through the shadcn Chart component and load separately from the console.

The login asks only for email and password. Set the initial administrator with
`ADMIN_EMAIL` and `ADMIN_PASSWORD` in the server environment. Set `VITE_API_URL`
for the public API address (restart Vite or rebuild the dashboard after changing it).

Sidebar navigation groups the main screens, Integraciones, Multitenant and
Proyecto in one place. Sections collapse independently; `Cmd+K` / `Ctrl+K`
opens screen search. On mobile, navigation opens in a Sheet.

Administrators can permanently delete users (revoking their sessions) and tenants
(removing local tenant resources, keys, events and deliveries in one transaction).
The final active administrator is protected. Deleted tenants are not recreated
by environment bootstrap; external provider numbers and accounts are retained.

WhatsApp setup links offer both connection types by default, allowing the customer
to choose Coexistence or a dedicated connection on the hosted page. The console
can restrict a link to either type. Instance readiness is exposed by `/v1/me`
without disclosing configuration secrets. Browser tests clean up the users and
tenants they create, including on failures.

Configuration → WhatsApp shows credential presence, where to obtain each value,
a copyable server `.env` example, restart instructions and the selected tenant
callback. `/admin/v1/settings/whatsapp` returns presence booleans, never secrets.

Documentation is served at `/docs`: server-rendered guides, a searchable sidebar,
and a locally bundled interactive reference split into Messaging, Administration
and Compatibility APIs. OpenAPI is the source of truth; descriptions, examples
and security details must match server behavior. `pnpm install` copies the pinned
Scalar browser bundle into ignored `packages/docs/vendor/`; Docker builds include
it automatically. No CDN, analytics or request proxy is required to use the docs.

The account menu in the top bar includes a light/dark theme switch. The browser
retains the theme preference independently of the login session. Resource tables
share compact headers, integrated search and confirmation dialogs for destructive
actions. The console and documentation use the same Wapo favicon.

Project identity is configured under Configuration → Project. The console uses
“project” for the tenant isolation boundary; existing `/admin/v1/tenants` routes
remain unchanged. Name, PNG/JPEG logo, accent color and hosted-link theme are saved
in PostgreSQL through `/v1/project`. Existing setup links use current saved branding.

Console users have admin, member, viewer or billing roles with access to all
projects or an explicit selection. An admin with all-project access manages
platform users and projects. Members manage operational resources but cannot
create API keys or edit project identity. Viewers can read without mutating
resources or managing keys. Billing users can read the project identity and
overview; billing/invoice management is not implemented. The API enforces these
permissions on every request. Existing sessions use current assignments.

Observability combines authenticated API request metadata, stored events and
the latest webhook delivery state. `/v1/logs` supports source, time window,
search, error and cursor filters. `/v1/logs/{id}` returns project-scoped detail
with secret-like payload fields redacted. API logs start at deployment; historical
API traffic, full request bodies and anonymous authentication failures are not
reconstructed. API errors are retained while successful requests are sampled at 1%
by default (`REQUEST_LOG_SAMPLE_RATE`). The time filter and API log retention both
cover up to 30 days.

Administrative operations have a separate durable audit trail containing actor,
normalized route, request ID, status and duration without request bodies or secrets.
The worker applies automatic retention: 30 days for API logs and completed work,
90 days for audit records, unresolved journals, failed deliveries and orphaned
events. Expired sessions and stale onboarding claims are cleaned automatically.

Each console user can edit their name and email, choose Spanish, Portuguese or
English, and regenerate their avatar from the account menu. These profile
preferences are stored in PostgreSQL and follow the user across browsers.

## Interface motion and documentation theme

The console uses Motion for page entry, table rows, cards, login and the active
navigation indicator. Shared CSS handles button feedback and Radix collapsibles.
`MotionProvider` respects system reduced-motion preferences; keep animation timing
in these shared components rather than adding page-specific effects.

Documentation has its own light/dark toggle, defaults to the system theme, and
stores the override in `wapo-docs-theme`. The setting applies to guides, search and
the self-hosted Scalar reference without losing the selected API configuration.

## Monitoring

Customer details include scoped message metrics and daily charts for 7, 30 or 90
days. Connection diagnostics show provider access, token scopes, app subscription,
webhook verification and messaging-health signals. See [connection health](docs/connection-health.md).

Template status, category, scheduled category and quality changes produce signed
webhook events with previous/current snapshots. The worker reconciles pending
accounts and periodically checks approved templates. See [template lifecycle](docs/template-lifecycle.md).

The Meta setup guide is available in Console → Configuration → WhatsApp and
`/docs#meta-setup`, with environment sources, callback setup and a verification
command.

Hosted setup links use two steps: connection type and Meta authorization. They show
only the modes allowed by the link, use the project logo/colors/theme, and explain
the requirements for Business App Coexistence and dedicated numbers. They do not
offer phone-number provisioning. Browser tests mock the Meta SDK and completion API.

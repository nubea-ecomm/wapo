# Architecture

Wapo is a modular monolith with independent API and webhook-worker processes.
The first release is a developer preview, not full hosted-platform feature parity.

```text
React dashboard / public clients / TypeScript SDK
                    |
                  Go HTTP
          +---------+----------+
          |                    |
       Native /v1       Compatibility adapters
          |           /platform/v1, /meta/whatsapp
          |                    |
       project-scoped domain --+-- optional upstream bridge (one project)
          |
    channel.Connector
      |           |
   Webchat    WhatsApp Cloud API -> Meta
          |
      PostgreSQL (durable source of truth)
          |
     signed delivery outbox -> application webhooks
     email notification outbox -> SMTP / Amazon SES SMTP
```

## Product hierarchy

- Project: authorization and data isolation boundary. Has hashed API keys.
- Customer: the developer's business customer, identified by a unique
  `external_customer_id`. This is not an end-user WhatsApp contact.
- Setup link: customer-scoped, expiring, revocable onboarding capability.
- Connection: a customer's channel account; many connections per customer.
  WhatsApp bindings carry phone ID, WABA ID and dedicated/coexistence type.
- Contact: an end user scoped to one connection, with provider identity, local
  properties and a provider-controlled marketing preference.
- Message: channel-neutral record plus original provider payload.
- Event: append-only source event, deduplicated by project/source key.
- Subscription/delivery: project or connection webhooks and durable retries.

Customers must never become equivalent to WhatsApp numbers. New channels should
reuse the customer hierarchy and connector interface. Conversations are persisted per connection/contact, with last-message summaries,
assignment labels and open/closed status. Cross-channel end-user identity merging,
managed user memberships, automation runs and integration actions remain future
domains. Assignment labels do not create user accounts.

## Storage and secrets

PostgreSQL stores mature domains in typed relational tables and retains a
project-scoped JSONB resource store for evolving provider-shaped records, plus
explicit key, request-journal, event and outbox tables. Customers and contacts use
typed tables; transactional resource mirrors and database synchronization triggers
are temporarily retained so old and new application images can coexist during a
rolling deployment or rollback. Database unique
indexes enforce customer external IDs and phone bindings. WhatsApp phone IDs and
WABA ownership are exclusive to one tenant, because Meta callback overrides are
WABA-scoped. PostgreSQL ownership triggers permit multiple numbers under the same
WABA only within its owning tenant. Conversation and message resources remain JSONB
while those domains mature. Customer deletion currently requires deleting
connections first; webhook deliveries whose subscription disappears are cancelled.

API keys are stored as SHA-256 hashes of high-entropy secrets. Meta tokens, webhook
secrets and dedicated registration PINs use AES-256-GCM, with project ID as
associated data. Preserve and back up ENCRYPTION_KEY: changing it does not rotate
existing ciphertext unless the offline `rotate-encryption-key` command is used.
Tokens and PINs are excluded from API responses. There is no hosted secret manager
or key rotation UI yet. The backup, restore and rotation runbooks live in
[operations](operations.md).

Redis is not required. The optional Valkey Compose profile is reserved for future
cache/presence; the application does not currently use it. Media URLs pass through
to Meta. Object storage/media ingestion is not implemented in standalone mode.

## Delivery guarantees

Source events and delivery jobs are committed in one transaction. Duplicate
provider IDs do not create duplicate records or jobs. Workers claim deliveries
with SKIP LOCKED and a 60-second lease, retry up to eight attempts with exponential
backoff, and preserve failed jobs. Delivery is at least once, may arrive out of
order, and must be deduplicated by X-Idempotency-Key. Receiver signatures use raw
bytes, not reserialized JSON. Project webhook secrets are never transmitted.

For outbound sends, a durable idempotency reservation is written before calling
Meta. Successful responses and definitive 4xx responses can be replayed. A pending
reservation after a timeout/crash remains unresolved (409), rather than triggering
an automatic second send. There is no exactly-once guarantee across an external
provider boundary and no automatic stale-reservation expiry. Inspect message
history/provider records before issuing a new logical send. The offline
`operations` command reports unresolved reservations without exposing payloads;
retention remains automatic.

Webchat sends persist messages for authenticated API consumers; this is not yet a
public visitor-session widget or real-time end-user transport.

## Boundaries and deployment

API keys grant full access to one project. Project-scoped APIs issue and revoke
keys. The operator API uses a separate ADMIN_API_KEY to manage tenants, suspension
and keys. Operators may act within one explicitly selected active tenant using
X-Tenant-ID; project keys ignore this header and cannot switch tenants. Console administrators sign in with email/password. Passwords use bcrypt (cost
12); opaque session tokens are stored as hashes, expire in 12 hours and can be
revoked. Logout and password reset revoke sessions; inactive users cannot
authenticate. Administrators create/disable other console administrators from the
Users screen. Authboss handles public signup, password login, email verification,
recovery and password changes through adapters to the existing PostgreSQL user
tables and durable mail outbox. Project memberships carry independent roles;
public registrations never grant global access. See [account management](authentication.md).
The bridge is explicitly restricted to one project per process
and has separate credentials. Bridge resources remain upstream and are not mirrored
into native collections or the native dashboard. Never mix native customer IDs
with bridged customer IDs.

Login limiting defaults to ten attempts/source/minute and is configurable with
`LOGIN_RATE_LIMIT_PER_MINUTE`. Public API quotas belong at the edge
for high-throughput deployments; `PUBLIC_RATE_LIMIT_PER_MINUTE=0` leaves the
in-process fallback disabled. A positive value enables a shared PostgreSQL quota.
Replicas reserve small token blocks so the fallback does not write its hot counter
on every request, while PostgreSQL still prevents the configured global total from
being exceeded. Public onboarding and webhook ingress should also use an edge
abuse-control layer.
CORS permits the comma-separated WEB_ORIGIN allowlist. HTTP localhost, 127.0.0.1
and ::1 are aliases only on the same configured local port; production origins
require exact matches. hosted onboarding
completion additionally checks the exact PUBLIC_URL origin when Origin is present.
Local Compose ports bind to loopback; public hosting needs HTTPS termination,
network configuration, backups and an actual domain. No cloud deployment is
performed by creating this repository.

Positive API-key authentication results use a bounded five-second in-process cache
by default. Local revocations invalidate immediately; replicas converge within
`AUTH_CACHE_TTL`. Set the TTL to zero when revocation must be synchronous across
replicas, or use a deployment-level invalidation mechanism. PostgreSQL pool bounds
are explicit per replica through `DB_MIN_CONNS` and `DB_MAX_CONNS`; their aggregate
must stay within the database connection budget.

Webhook egress rejects private/reserved addresses during DNS resolution and pins
the dialed IP to prevent DNS rebinding. Redirects and environment proxies are
disabled. ALLOW_PRIVATE_WEBHOOKS is for isolated local tests only.

The worker runs storage maintenance at startup and every six hours. Expired console
sessions are removed immediately; API logs, completed request journals and completed
deliveries use a 30-day retention period. Administrative audit records, unresolved
request journals, failed deliveries and unreferenced events use 90 days. Stale
onboarding claims are released after 15 minutes and rate-limit counters after ten.

Authenticated administrative operations are written to `admin_audit_logs` with the
actor, normalized route, request ID, status and duration. Bodies, credentials and
headers are never recorded.
Batched API telemetry preserves every error and samples successful requests according
to `REQUEST_LOG_SAMPLE_RATE` (1% by default). This bounds write amplification at high
traffic; administrative audits, domain events and message records are never sampled.

Email notification preferences are project-scoped. SMTP credentials are process
environment secrets, while recipients, switches and a durable retry outbox live in
PostgreSQL. Health-transition alerts are inserted in the same transaction as the
new connection diagnosis. Periodic summaries are deduplicated by UTC reporting
period. SMTP delivery is at least once across process crashes.

Console member invitations use the same durable email worker. Invited accounts are
inactive until a seven-day, single-use token is accepted and a password is set.
Validation tokens are hashed; the outbox carries an encrypted token only until the
message is rendered. Installations without SMTP retain manual initial-password user
creation.

## Extension roadmap

1. Real Meta pilot: app review, business permissions, coexistence eligibility,
   webhook field subscriptions, history/contact synchronization reconciliation.
2. Durable onboarding recovery jobs, reconnection and token/key rotation.
3. Cross-channel contacts/identities, managed memberships and real-time inbox delivery.
4. Telegram/email connectors and S3-compatible media storage.
5. Durable workflows, AI providers/tools, handoff and execution traces.
6. Broadcast scheduling, usage/billing, embedded SDK, carrier provisioning.

Do not present roadmap features as implemented capabilities.

The current public deployment enables WhatsApp only. The webchat adapter is
retained for internal connector tests, which explicitly opt into it. Disabled
connectors cannot create connections or send messages; their resources are
excluded from the public catalog, lists and overview totals.

Customer detail metrics use `GET /v1/customers/{id}/metrics?days=7|30|90`.
Queries join stored messages to the customer's current WhatsApp connections inside
one project. Message periods use UTC database ingestion dates, not untrusted
provider timestamps. Daily series include zero days. Sent means the current status
is sent, delivered or read; failed and pending are separate. Connection types and
conversation counts describe current totals and do not use the message period.
Deleted connections are excluded. Historical messages from before this instance
received events cannot be reconstructed.

WhatsApp conversations track a customer-service window from the server ingestion
time of the latest inbound message. Free-form sends are rejected outside that
24-hour window with `template_required`; approved templates are allowed at any
time and are mandatory when starting a new conversation. An inbound reply opens
the window and persists `service_window_expires_at` on the conversation summary.

WhatsApp Business profiles are provider-authoritative. Native connection endpoints
validate and relay reads/updates to Meta without creating a stale local profile
copy. The console edits text, contact, category and website fields and displays the
current image. Creating a new profile-picture handle through Meta resumable upload
is not implemented.

Contacts are typed PostgreSQL records scoped to one project and one WhatsApp
connection. Generic contact resources remain as a rolling-deployment mirror.
Marketing preference is provider-controlled and stored per contact/number; no row
means allowed. Meta preference webhooks and error 131050 update state and emit a
signed transition event. Known marketing templates are suppressed before provider
egress when the preference is stopped. Contact erasure removes related local
messages, calls, media references, conversation, preference and known events
transactionally.

Conversation reads resolve the current typed contact instead of relying on the
historical name snapshot. Effective-name precedence is local customization, Meta
profile name, WhatsApp username, then phone number. Provider updates continue to
refresh the name only until an operator customizes it.

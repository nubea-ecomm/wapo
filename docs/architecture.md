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
```

## Product hierarchy

- Project: authorization and data isolation boundary. Has hashed API keys.
- Customer: the developer's business customer, identified by a unique
  `external_customer_id`. This is not an end-user WhatsApp contact.
- Setup link: customer-scoped, expiring, revocable onboarding capability.
- Connection: a customer's channel account; many connections per customer.
  WhatsApp bindings carry phone ID, WABA ID and dedicated/coexistence type.
- Message: channel-neutral record plus original provider payload.
- Event: append-only source event, deduplicated by project/source key.
- Subscription/delivery: project or connection webhooks and durable retries.

Customers must never become equivalent to WhatsApp numbers. New channels should
reuse the customer hierarchy and connector interface. Conversations are persisted per connection/contact, with last-message summaries,
assignment labels and open/closed status. Cross-channel end-user identity merging,
managed user memberships, automation runs and integration actions remain future
domains. Assignment labels do not create user accounts.

## Storage and secrets

PostgreSQL stores typed resource categories in a project-scoped JSONB resource
store, plus explicit key, request-journal, event and outbox tables. Database unique
indexes enforce customer external IDs and phone bindings. WhatsApp phone IDs and
WABA ownership are exclusive to one tenant, because Meta callback overrides are
WABA-scoped. PostgreSQL ownership triggers permit multiple numbers under the same
WABA only within its owning tenant. This keeps the initial
surface small; relational foreign keys for customer/connection lifecycle and
specialized contact/conversation tables should replace generic resource storage
as those domains mature. Customer deletion currently requires deleting connections
first; webhook deliveries whose subscription disappears are cancelled.

API keys are stored as SHA-256 hashes of high-entropy secrets. Meta tokens, webhook
secrets and dedicated registration PINs use AES-256-GCM, with project ID as
associated data. Preserve and back up ENCRYPTION_KEY: changing it does not rotate
existing ciphertext. Tokens and PINs are excluded from API responses. There is no
hosted secret manager or key rotation UI yet.

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
history/provider records before issuing a new logical send. The journal currently
requires operator SQL for unresolved-request inspection and retention.

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
Users screen. No public signup or per-tenant team membership system is implemented. The bridge is explicitly restricted to one project per process
and has separate credentials. Bridge resources remain upstream and are not mirrored
into native collections or the native dashboard. Never mix native customer IDs
with bridged customer IDs.

Rate limiting is 300 requests/project/minute and ten login attempts/source/minute.
Counters are hashed and stored in PostgreSQL, so API replicas share the same quota.
Public onboarding and webhook ingress should still use an edge abuse-control layer.
CORS permits the comma-separated WEB_ORIGIN allowlist. HTTP localhost, 127.0.0.1
and ::1 are aliases only on the same configured local port; production origins
require exact matches. hosted onboarding
completion additionally checks the exact PUBLIC_URL origin when Origin is present.
Local Compose ports bind to loopback; public hosting needs HTTPS termination,
network configuration, backups and an actual domain. No cloud deployment is
performed by creating this repository.

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

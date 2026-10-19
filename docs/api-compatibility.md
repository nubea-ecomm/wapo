# Public API compatibility

The operation inventory is [api-compatibility.json](./api-compatibility.json).
It records 195 operations from the four published OpenAPI documents reviewed on
2026-10-16: 46 WhatsApp/Meta, 109 platform, 29 workflows and 11 agent operations.
The source index was an external hosted API inventory captured during compatibility analysis.

`implemented_partial` means that a route is available, not that its complete
contract is identical. `pending` means there is no standalone implementation.
The optional provider bridge is separate from standalone support.

## Meta adapter

The `/meta/whatsapp/{version}` router handles the 46 documented operation shapes:
messages, marketing messages, conversations, contacts, calls, media, templates,
profiles, usernames, blocks, datasets, WhatsApp Flows and phone details.

Every request resolves a connection in the authenticated project. WABA routes use
that account's stored token. Flow/template IDs must be recorded for that project
or verified against the account's asset list. Media and dataset IDs must have
been observed through Wapo. Unknown IDs never receive an arbitrary account token.

Provider payloads and errors are relayed. JSON and multipart uploads are accepted.
Paging URLs are rewritten without provider credentials. Media download URLs use
an encrypted capability lasting ten minutes and still require a project API key.
Meta calling routes relay signaling; Wapo does not host an audio/media server.

Stored message, conversation, contact and call reads use Wapo's database. They
cannot retrieve history that Wapo never received. List support currently covers
`after`, `limit`, status, direction and contact/call filters; `before`, date filters,
field projections and all provider-specific enrichments are not fully matched.
Message sending retains Wapo's idempotency and durable event semantics.
WhatsApp Business profile GET/POST is relayed to Meta and is also available as a
validated native connection endpoint with console editing for text, category and
website fields. Profile-picture upload still requires an external Meta resumable
upload handle.

## Customers and setup links

Customer CRUD, setup link creation/list/update, project and phone webhooks, phone
list/get/update/delete and message list/get have compatibility routes. Webhook
updates support URL, active, events and secret rotation; buffering is not yet
implemented. Health returns Wapo connection diagnostics rather than an identical upstream
platform health schema.

Setup links support customer-managed billing, dedicated/Coexistence selection,
project branding, per-link colors, allowed origins, redirects, expiration,
revocation and credential renewal for the same phone and customer. Their default
expiration is thirty days. IDs and some response fields differ. Provisioned phone
numbers and partner-managed billing require provider integrations and are not
implemented. Language selection is validated/stored; hosted copy is Spanish.

## Remaining platform services

Broadcasts/scheduling, contact management and marketing preference synchronization,
conversation assignments, display name request tracking, resumable media ingest,
embeddable inbox tokens, hosted dynamic Flow endpoints, funding, notifications,
findings, workflow execution, function deployment and agent runs remain pending.
The inventory lists each missing operation instead of exposing successful-looking
placeholder handlers. No full API parity or live Meta certification is claimed.

Wapo's project-scoped `/v1/notification-settings`, SMTP email outbox and console
member invitation endpoints are native operational features; they do not implement
the reference platform's pending notification service or alter its compatibility
inventory.

## Verification

PostgreSQL integration tests use fake Meta servers to verify account selection,
stored credentials, template creation, safe pagination, resource ownership,
onboarding, renewal and project isolation. Browser tests exercise template
management from customer and connection screens. Real Meta credentials and app
approval are needed for a deployment acceptance test.

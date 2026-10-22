# Public API compatibility

The operation inventory is [api-compatibility.json](./api-compatibility.json).
It records 195 operations from the four published OpenAPI documents reviewed on
2026-10-16: 46 WhatsApp/Meta, 109 platform, 29 workflows and 11 agent operations.
The source index was an external hosted API inventory captured during compatibility analysis.

`implemented_partial` means that a route is available, not that its complete
contract is identical. `pending` means there is no standalone implementation.
The optional provider bridge is separate from standalone support.

## Meta adapter

Meta ingress uses the instance-wide `GET/POST /hooks/meta` callback. It validates
the original payload signature and routes WABA/phone ownership internally,
including multi-project batches and account-level events. The legacy
`/hooks/meta/{project}` endpoints remain compatible and project-scoped. Wapo's
outgoing project and connection webhook subscriptions are unchanged. See
[onboarding and migration](whatsapp-onboarding.md#transition-from-project-callbacks).

Native account management now exposes Authboss-backed public registration,
verification, recovery, password changes, session management and project invitations.
These `/auth/v1/*` and `/v1/members*` routes are Wapo extensions, not upstream parity
claims. Existing login tokens and legacy administration routes retain their contracts.
Profiles additionally expose project-specific `project_roles`; scoped users cannot
change their email through profile PATCH; neither can non-admin all-project users.
Replacement invitations and membership changes invalidate older pending invitation
links. Issued verification/recovery tokens remain usable when SMTP is disabled.
See [authentication](authentication.md) and [CORS configuration](operations.md).
`POST /auth/v1/register` also accepts an optional `language` (`es`, `en`, `pt`);
omitting it preserves the existing Spanish API default.
`GET /v1/members` includes `created_at` (account creation time) and
`avatar_variant` for the project-team table; membership authorization is unchanged.

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
WhatsApp sends resolve recipient aliases only from stored Meta acceptance or
delivery evidence scoped to the same project and connection. Native stored
messages expose the WhatsApp identity in `to` and the actual transport input in
`payload.to`; compatibility send responses retain the original provider body.
See [recipient identities](contacts-and-consent.md#whatsapp-recipient-identities).
Native conversation replies also accept validated media, contacts and interactive
`payload` objects. Connection-scoped multipart media upload/download and per-reader
inbox read markers are Wapo extensions. Read markers do not relay WhatsApp read
receipts. See [the composer contract](contacts-and-consent.md#composer-attachments-and-interactive-messages).
Quoted replies (`payload.context.message_id`) and reactions require a stored target
in the same conversation on native and compatibility sends. Reaction raw events
remain available, while inbox lists exclude reaction rows and project active
reactions and quoted-message previews onto content messages. See
[reply and reaction semantics](contacts-and-consent.md#quoted-replies-and-reactions).
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

Broadcasts/scheduling, full platform contact-route parity,
conversation assignments, display name request tracking, resumable media ingest,
embeddable inbox tokens, hosted dynamic Flow endpoints, funding, notifications,
findings, workflow execution, function deployment and agent runs remain pending.
The inventory lists each missing operation instead of exposing successful-looking
placeholder handlers. No full API parity or live Meta certification is claimed.

Wapo's project-scoped `/v1/notification-settings`, SMTP email outbox and console
member invitation endpoints are native operational features; they do not implement
the reference platform's pending notification service or alter its compatibility
inventory.

Wapo has native typed contacts with custom properties, erasure and per-number
marketing preference synchronization. Graph-shaped contact reads use the same local
identity, while the full reference Platform contact route family remains a separate
compatibility gap.

## Verification

PostgreSQL integration tests use fake Meta servers to verify account selection,
stored credentials, template creation, safe pagination, resource ownership,
onboarding, renewal and project isolation. Browser tests exercise template
management from customer and connection screens. Real Meta credentials and app
approval are needed for a deployment acceptance test.

# Public API compatibility

The operation inventory is [api-compatibility.json](./api-compatibility.json).
It records 195 operations from the four published OpenAPI documents reviewed on
2026-10-16: 46 WhatsApp/Meta, 109 platform, 29 workflows and 11 agent operations.
The source index was an external hosted API inventory captured during compatibility analysis.

`implemented_partial` means that a route is available, not that its complete
contract is identical. `pending` means there is no standalone implementation.
The optional provider bridge is separate from standalone support.

## Meta adapter

The Wapo-specific public setup configuration includes `business` prefill with only
the linked customer's saved name and optional email, cleaned of characters Meta
rejects (values Meta would refuse are omitted). Hosted signup requests
`extras.version = "v5"` for both modes, retaining Coexistence-specific parameters.
No website/country defaults or arbitrary customer metadata are forwarded to Meta.

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

## Media ingest

`POST /platform/v1/whatsapp/media` implements `delivery: "meta_resumable_asset"`.
Wapo resolves `phone_number_id` to a connection of the authenticated project (an
unknown or foreign number is a 404 and the source is never fetched), downloads
`source`, and runs Meta's Resumable Upload API on the instance's `META_APP_ID`
with that connection's stored token. The answer is
`{"data":{"target":{"kind":"meta_resumable_asset","handle":"<h>"}}}`; the handle
is the `header_handle` example of an IMAGE, VIDEO or DOCUMENT template header.

The source is a URL chosen by the API caller, so the download is guarded against
server-side request forgery: HTTPS on port 443 only, no URL credentials, at most
three redirects, and every connection — each redirect included — is checked
against the IP actually dialed, rejecting loopback, private, link-local, CGNAT,
cloud-metadata, multicast and documentation ranges. Proxies from the environment
are ignored. Downloads have a 5 s connect, 15 s header and 90 s total deadline.

`mime_type` is required and limited to Meta's template header types: `image/jpeg`
and `image/png` (5 MB), `video/mp4` and `video/3gpp` (16 MB), `application/pdf`
(100 MB). The cap is enforced on the bytes read, not on a declared length, and
the file's leading bytes must match the declared type, so an HTML error page
served with 200 is refused (`media_type_mismatch`). `filename` defaults to the
last path segment of the URL. The file is spooled to a temporary file and
removed after the upload. Error codes: `invalid_source_url`, `source_not_allowed`,
`source_redirect_limit`, `source_unavailable`, `source_empty`, `source_timeout`,
`source_fetch_failed` (download), `unsupported_media_type`, `media_too_large`
(413), `media_type_mismatch`, `meta_app_not_configured` (503), `meta_upload_failed`
and `provider_unavailable` (502). Error messages never repeat the source URL,
because signed bucket URLs carry credentials. `delivery: "meta_media"` answers
501 `media_delivery_not_implemented`; upload send-time media through
`/meta/whatsapp/{version}/{phone_number_id}/media` instead. A project using the
upstream bridge keeps relaying the request upstream. `ALLOW_PRIVATE_WEBHOOKS=true`
(local tests only) also lifts the HTTPS and public-address rules here.

## Customers and setup links

Native connection health reports omit unsupported SIP/calling diagnostics and
separate payment/business-verification warnings from messaging failures. The raw
Meta `can_send_message` value is retained; it is not a live-send result. See
[connection diagnostics](connection-health.md) for severity and cache semantics.

Hosted onboarding emits `whatsapp.phone_number.created` with `phone_number_id`,
`business_account_id`, `display_phone_number` and `customer.id`, at the top level
and inside `data`, like the reference event.

Compatibility phone records (`GET /platform/v1/whatsapp/phone_numbers[/{id}]`)
include `whatsapp_business_manager_messaging_limit`. The reference platform
reports a numeric daily cap there; Wapo reports Meta's `messaging_limit_tier`
label (`TIER_250`, `TIER_1K`, `TIER_10K`, `TIER_100K`, `TIER_UNLIMITED`, …) as the
connection health check last saw it, or `null` before a check has succeeded.
Reading a phone never calls Meta. `status` keeps Wapo's own connection status
values.

Customer CRUD, setup link creation/list/update, project and phone webhooks, phone
list/get/update/delete and message list/get have compatibility routes. Webhook
updates support URL, active, events and secret rotation; buffering is not yet
implemented. Phone health (`GET /platform/v1/whatsapp/phone_numbers/{id}/health`) answers the
reference platform's schema — `status`, `timestamp`, `error` and the
`phone_number_access`, `token_validity`, `webhook_subscription`,
`webhook_verified` and `messaging_health` checks — derived from the cached
native diagnostics. See [connection diagnostics](connection-health.md#platform-compatible-health).

Setup links support customer-managed billing, dedicated/Coexistence selection,
project branding, per-link colors, allowed origins, redirects, expiration,
revocation and credential renewal for the same phone and customer. Their default
expiration is thirty days. IDs and some response fields differ. Provisioned phone
numbers and partner-managed billing require provider integrations and are not
implemented. The hosted page renders Spanish (`es`) or English (`en`) from the
link's configured language, including status messages and the Meta SDK locale.
Omitted values and other accepted languages currently fall back to Spanish.

## Remaining platform services

Broadcasts/scheduling, full platform contact-route parity,
conversation assignments, display name request tracking, `meta_media` ingest,
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

# Customer onboarding and WhatsApp Coexistence

Wapo's model follows a standard hosted flow: create a customer, create a setup link, let the
customer authorize Meta, receive `whatsapp.phone_number.created`, then send using
the connected phone ID. A customer can own multiple channel connections.

For the dashboard paths, provider enrollment, review forms and activation checklist,
start with [Activate WhatsApp with your own Meta app](meta-activation.md).

## Configure your own Meta app

Set META_APP_ID, META_APP_SECRET, META_EMBEDDED_SIGNUP_CONFIG_ID,
META_VERIFY_TOKEN, META_GRAPH_VERSION and an HTTPS PUBLIC_URL. Use the current Meta
Embedded Signup Builder and a Facebook Login for Business configuration supporting
the WhatsApp products and Coexistence. Add the hosted origin to Meta's allowed
domains and follow the exact OAuth/SDK configuration requirements for your app.

The app owner must obtain the relevant Meta business verification, app review,
advanced permissions and Tech Provider/partner eligibility. Wapo cannot grant
these approvals. App and country eligibility vary; deployment with credentials is
required for a real acceptance test. The standalone implementation is locally
contract-tested with mocked Meta responses, not certified as production-ready.

Subscribe the app to Meta's required WhatsApp fields, including `messages`,
`account_update`, `smb_message_echoes`, `history` and `smb_app_state_sync`. Register
the single app callback at `PUBLIC_URL/hooks/meta` with the configured verify token.
Wapo subscribes every authorized WABA with an override pointing to that same global
URL and verifies `X-Hub-Signature-256` against the app secret. Dedicated registration
uses a cryptographically random PIN encrypted in the connection record.

Wapo resolves the internal project from the WABA ID (`entry.id`) and/or the phone
ID (`value.metadata.phone_number_id`). Accounts and numbers retain their exclusive
project ownership. Batches can contain multiple projects; template/account events
without a phone ID use WABA ownership. Unknown assets are acknowledged and ignored,
never routed to a default project. A known phone/WABA mismatch rejects the batch
before processing. Suspended projects continue receiving provider events.

Verification is stored at app/instance scope and does not require creating or
selecting a project. Project/connection webhooks configured inside Wapo are a
separate outgoing delivery mechanism for your applications.

### Transition from project callbacks

Deploy API and worker with migration `022_global_meta_webhook.sql`, then copy the
global callback from Configuration → WhatsApp into Meta and verify it once. Keep
the same app credentials. Existing `/hooks/meta/{project}` URLs remain supported
and project-scoped, including legacy WABA overrides. Changing the app default
does not remove an existing WABA override. New onboarding and credential renewal
replace that WABA's override with the global URL; renewal preserves connection IDs
and does not repeat number registration or one-shot history sync. Existing numbers
do not need to be deleted or re-created to continue receiving messages.

## Create customer and link

```bash
curl -X POST "$WAPO_URL/v1/customers" \
  -H "X-API-Key: $WAPO_API_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"Example store","external_customer_id":"store-123","metadata":{"plan":"pro"}}'

curl -X POST "$WAPO_URL/platform/v1/customers/CUSTOMER_ID/setup_links" \
  -H "X-API-Key: $WAPO_API_KEY" -H 'Content-Type: application/json' \
  -d '{"setup_link":{"allowed_connection_types":["coexistence"],"provision_phone_number":false,"success_redirect_url":"https://your-app.example/connected","meta_billing_mode":"customer_managed"}}'
```

Share `data.url` with the customer. The database stores the capability encrypted
and its lookup hash. Authorized GET/list requests can retrieve the URL. Links expire
in 30 days by default and can be revoked through `DELETE /v1/setup_links/{id}` or the
compatibility alias `/platform/v1/setup_links/{id}`. The hosted page requires no
project API key and exposes only public Meta configuration.

Links support `theme_config` hex colors, HTTPS `allowed_origins`, redirect URLs,
`expires_at`, and PATCH updates. Project branding supplies defaults.
`reconnect_phone_number` creates a credential renewal link for an existing customer
connection. Renewal verifies the original phone and WABA, preserves the connection
ID, and does not repeat registration or one-shot history sync.

## Coexistence behavior

The hosted page launches the Meta SDK with
`extras.featureType = "whatsapp_business_app_onboarding"` and
`extras.sessionInfoVersion = "3"` for Coexistence, as Meta's Business App
onboarding guide requires. Use a Facebook Login for Business configuration with
the Embedded Signup variation and WhatsApp Cloud API product selected (v4); Meta
deprecated v2 and v3 configurations on October 15, 2026. It
accepts Meta-origin session messages and both FINISH and
FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING events. Configured current-version Builder
settings determine available onboarding products; this code does not force a
legacy Embedded Signup version.

The server exchanges the authorization code, discovers phones under the shared
WABA (including when the completion event omits a phone ID), and verifies Meta's
`is_on_biz_app` flag matches the selected mode. Ambiguous phone selections fail
instead of binding an arbitrary phone. Discovery currently handles the first 100
WABA phone records; paginate discovery before deploying to larger portfolios.

After subscription, dedicated numbers are registered with the Cloud API.
Coexistence numbers are never registered/migrated by the dedicated path. Instead,
Wapo requests the contacts and history sync operations (`smb_app_state_sync` and
`history`) and preserves incoming snapshots. Both sync requests are attempted even
if one fails. These are time-sensitive, one-shot operations; validate Meta's
current rules before a production launch.

Messages sent by Business App arrive as outbound echoes and are persisted in
message history. Raw history/contact/account snapshots are deduplicated in the
event log and can be read from `/v1/events` or delivered through subscriptions.
Full contact import, history flattening, app-disconnect reconciliation and
conflict-aware human/AI handoff are not implemented yet. Never treat outbound echoes
as new inbound messages to an agent.

Credentials are saved before subscription/registration/sync. A partial failure
leaves the connection `onboarding_failed` with an operation error, rather than
silently claiming success or repeating the OAuth exchange. Current recovery is an
operator task; automated recovery from partial onboarding failures is not implemented. Credential
renewal links are available for existing connections. A
completed link cannot be reused. Do not delete a partial connection and blindly
repeat one-shot provider operations.

Wapo inspects stored credentials with Meta during health checks and before template
or message operations. Valid expiring system-user tokens are renewed server-side in
their final seven days and the replacement remains encrypted. Business integration
tokens normally do not expire. Meta does not allow an already expired token to be
refreshed; in that case the console offers a reconnect link that preserves the
connection ID and message history while the customer authorizes a replacement.

## Current boundaries

- Hosted page only: origin-restricted embeddable onboarding SDK is not implemented.
- Meta billing is customer-managed. No shared credit line or carrier pool.
- Provisioning and partner_managed billing return explicit 501 responses in
  standalone mode; the optional bridge delegates them upstream. Credential renewal
  through reconnect_phone_number is supported for existing connections.
- language is recorded; the current hosted page is Spanish. Project branding and
  theme_config style the hosted page. allowed_origins controls permitted browser
  origins for applicable setup requests; it does not grant Meta SDK domain access.
- Automated provider tests use mocks. Real account access checks during manual
  setup do not certify Embedded Signup completion or production messaging approval.

Primary references:
[Meta Embedded Signup](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview),
[Meta Coexistence](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users),
[Meta-maintained API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/du6gzjv/embedded-signup),
[Meta Embedded Signup](https://developers.facebook.com/docs/whatsapp/embedded-signup/).

## Project identity

A project and a tenant are the same isolation boundary. The console calls it a
project; `/admin/v1/tenants` remains compatible with existing clients.
`GET /v1/project` reads its settings. `PATCH /v1/project` updates `name` and the
`branding` object (`logo_data_url`, `accent_color`, `theme`). Omitted fields remain
unchanged. PNG and JPEG data URLs are limited to 5 MiB decoded, 4096 pixels per
dimension and 16 megapixels. SVG and remote URLs are rejected. An empty logo
removes it. Branding is stored in PostgreSQL and deleted with the project.

Settings → Project provides a local preview and an explicit save action. All
valid hosted links read the saved identity when opened, including previously
created links. Public configuration contains only the project name, branding
and signup configuration; it never contains API keys or Meta secrets.

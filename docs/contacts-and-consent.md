# Contacts and marketing consent

Wapo stores WhatsApp contacts as typed, project-scoped records. A contact belongs
to one connection, so the same person messaging two business numbers has two
records and two independent marketing preferences.

## Contact data

Contacts are created automatically from messages or manually through
**Console → Contacts** and `POST /v1/contacts`.

Provider-controlled fields are the WhatsApp ID, phone number, latest profile name
and marketing preference. Operators can edit a local display name, email and up to
50 custom scalar properties (string, number, boolean or null).

Names resolve consistently across Contacts and Inbox using this precedence:
operator display name, Meta `profile.name`, WhatsApp username, then phone number.
Until an operator customizes the display name, later profile-name changes from Meta
continue updating it automatically. The editor can remove a local override and
return to provider-managed naming.

The list supports search, connection and marketing-status filters. Existing generic
contact resources are migrated into the typed table and mirrored during rolling
deployments.

## WhatsApp recipient identities

Meta can accept a phone input that differs from the WhatsApp identity delivered
in incoming webhooks (including some Argentine numbers). Wapo resolves these
only from stored provider evidence: a successful send response's matching
`contacts[].input` / `wa_id`, or a delivered/read receipt's `recipient_id` for
that send. It never adds or removes country-specific digits speculatively.

Resolution is scoped to a project and connection. Replies reuse the accepted
input while service windows and new inbox messages follow the WhatsApp identity.
The message's `to` is the identity; `payload.to` preserves the actual Meta input.
On the next successful mapped send, legacy inbox histories for that input are
joined transactionally under the identity. Existing contact records and their
customizations are retained. Marketing suppression checks both identifiers.

Historical provider responses already stored by earlier versions can establish
the mapping. If no provider evidence links two numbers, Wapo leaves them separate;
a `131030` error alone does not establish identity and does not trigger retries.

Legacy conversation URLs continue resolving to the canonical inbox after history
reconciliation. Contact records and previously emitted webhook payloads are not
rewritten by this operation.

## Inbox updates and delivery indicators

The active inbox polls every 1.5 seconds while visible and refreshes on window
focus. Replies appear immediately as pending; accepted messages are inserted in
the local query cache without waiting for the next poll. Failures retain the
draft for inspection. Loading older history preserves scroll position, and
updates do not pull the reader away from older messages.

Delivery icons reflect recorded Meta status: clock for pending/unknown, one gray
check for sent, two gray checks for delivered, two blue checks only for read, and
an error icon for failed. API acceptance alone does not establish delivery or read.
Voice `played` receipts are retained as a separate status, shown as reproduced and
included in delivered/read metric totals. Later lower-ranked receipts cannot
downgrade this state.

## Composer, attachments and interactive messages

The inbox composer supports WhatsApp bold (`*text*`), italic (`_text_`), strike
(`~text~`) and monospace (triple backticks). Enter sends; Shift+Enter inserts a
line break. Formatting and provider text render as escaped React nodes, never HTML.

Attachments are uploaded through `POST /v1/connections/{id}/media` as multipart
`file` data. JPEG/PNG images are limited to 5 MB, audio/video to 16 MB and supported
documents to 100 MB. Media is held by Meta, not a Wapo object store. The upload
returns an ID without sending anything; retries of the subsequent message reuse
the same ID and logical idempotency key. The authenticated download endpoint is
`GET /v1/connections/{id}/media/{media_id}`. It validates project and connection
ownership and obtains a fresh provider URL; expired provider media cannot be
reconstructed. Credentials never appear in browser media URLs.

Recording needs HTTPS (or localhost), microphone permission and MediaRecorder.
The user can stop, preview or discard a recording before sending. Recordings stop
at two minutes. `voice=true` uploads are converted to mono OGG/Opus by ffmpeg in
the API image; native Go development needs ffmpeg installed on PATH. Conversion
uses pipe-only inputs, a 30-second deadline and at most two workers per process.
Audio cannot have a caption; an existing text draft is retained for a later send.

The interactive dialog sends reply buttons (up to three), a list (up to ten
options), a CTA URL, a published Flow belonging to the connection's WABA, or a
contact card. The Flow must already exist in Meta; this dialog does not author
or publish it. Native conversation replies accept a `payload` alongside the
existing `text`/`template` request variants. The server selects the conversation
recipient and enforces media ownership, validation, the service window and
durable idempotency for these sends. Closed windows still require a template.

## Per-reader inbox state

`has_unread` and `last_inbound_message_id` accompany conversation reads and lists.
The green row indicator means unread inbound content, independently of whether
the conversation is open or closed. Opening a loaded chat in a focused, visible
tab calls `POST /v1/conversations/{id}/read` with `message_id`; this cursor is
monotonic and cannot mark a newer racing message as read. It is scoped to the
project and console user (technical clients are scoped by credential). Viewers
can update their own read state. Read markers survive browser reloads and follow
confirmed conversation alias reconciliation. They are deleted with the conversation.

This local inbox marker does not send WhatsApp read receipts to the contact and
does not change outbound delivered/read/played status.

## Marketing preference

A preference is scoped to one contact on one business number. `stopped` blocks
MARKETING templates; `resumed` allows them. No recorded preference means resumed.
Utility and authentication templates and free-form messages inside the service
window are unaffected.

Preferences are read-only in Wapo. Only the WhatsApp user can stop or resume
promotions. Wapo records changes from Meta `user_preferences` webhooks, asynchronous
delivery error `131050` and synchronous send error `131050`.

Every real transition emits the signed event
`whatsapp.contact.marketing_preference_changed`. Before sending a known MARKETING
template, Wapo checks the preference and returns
`422 marketing_preference_stopped` without contacting Meta when stopped.

## Permanent erasure

`DELETE /v1/contacts/{id}` removes the local contact, preference, conversation,
messages, calls, observed media references, known contact events and matching
request responses in one transaction. Webhooks already delivered to external
applications cannot be recalled.

## API example

```bash
curl "$WAPO_URL/v1/contacts?search=ana&marketing_status=stopped" \
  -H "X-API-Key: $WAPO_API_KEY"
```

```bash
curl -X PATCH "$WAPO_URL/v1/contacts/CONTACT_ID" \
  -H "X-API-Key: $WAPO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "display_name": "Ana Compras",
    "email": "ana@example.com",
    "properties": {"plan": "enterprise", "priority": true}
  }'
```

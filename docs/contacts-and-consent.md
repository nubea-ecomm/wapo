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

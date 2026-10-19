# Template lifecycle

Wapo keeps an account-scoped snapshot of templates and compares observed values.
Templates belong to a WABA, so two phone connections to the same account share
state and history. Snapshots are isolated by project and WABA.

Subscribe through the webhook API or the console to:

- `whatsapp.template.status_changed`
- `whatsapp.template.category_changed`
- `whatsapp.template.category_change_scheduled`
- `whatsapp.template.quality_changed`

In Meta, subscribe the app to `message_template_status_update`,
`template_category_update` and `message_template_quality_update`, in addition to
message and onboarding fields. Account events are resolved using `entry.id`;
they do not need phone-number metadata. Webhook signatures are always verified.

A scheduled category correction records `scheduled_category` and its announced
time. It does not overwrite the effective category. A subsequent applied update
changes `category`. Both directions, including MARKETING to UTILITY, are tracked.

Payload example:

```json
{
  "event": "whatsapp.template.status_changed",
  "business_account_id": "WABA_ID",
  "occurred_at": "2026-10-16T23:00:00Z",
  "data": {
    "template": { "id": "TEMPLATE_ID", "status": "APPROVED" },
    "previous": { "id": "TEMPLATE_ID", "status": "PENDING" },
    "revision": 2,
    "source": "webhook"
  }
}
```

The worker discovers connected accounts, polls pending/in-appeal/pending-deletion
accounts after one minute, and reconciles other accounts after six hours. One
account is processed per worker tick; timing depends on queue size and provider
latency. Notifications wake the account for an earlier reconciliation. Pagination
uses up to 100 pages of 100 templates; errors retain successful observations and
back off from one minute to one hour. API creation/read observations also update
snapshots. Creation requests through the compatibility template adapter enter the
same tracking path.

Initial discovery through reads/polling establishes a baseline without historical
change notifications. A first actual Meta webhook may have an unknown previous
value. Repeated identical states do not produce another change. Explicitly older
provider timestamps and poll snapshots started before a newer observation are
ignored. Equal-second provider events cannot be totally ordered; reconciliation
restores the provider's current state. Polling cannot recover intermediate states
that happened between polls or prove deletion from an absent list item.

Snapshot changes, revision increments, event records and delivery jobs commit in
one PostgreSQL transaction. Account-level subscribers receive one delivery;
subscriptions tied to each current phone also receive the account's change. The
existing signed delivery worker retries failures. Delivery remains at least once:
consumers should deduplicate using the stable webhook event ID. This is separate
from suppressing duplicate observed transitions.

Read the latest 100 events from
`GET /v1/connections/{id}/templates/{template_id}/history`; the console displays
this history in the template detail dialog. Monitoring requires the worker and a
valid account token. Existing templates created before tracking have no earlier
history.

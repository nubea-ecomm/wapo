# Upstream compatibility

Wapo supports a project-scoped transitional bridge for an existing hosted messaging
provider. The bridge preserves request paths, JSON payloads, response status codes
and idempotency headers while substituting server-side upstream authentication.

## Bridge configuration

```dotenv
UPSTREAM_API_KEY=<existing-provider-project-key>
UPSTREAM_BRIDGE_PROJECT_ID=default
UPSTREAM_PLATFORM_URL=https://provider.example/platform/v1
UPSTREAM_WHATSAPP_URL=https://provider.example/meta/whatsapp
```

The bridge is restricted to one project per process. Its resources remain upstream
and are not mirrored into native Wapo collections. Never mix native customer IDs
with bridged customer IDs.

## Standalone mode

Leave `UPSTREAM_API_KEY` unset to use Wapo's PostgreSQL-backed implementation.
Create customers and register Meta numbers through `/v1`, or use hosted setup links
with automatic number provisioning disabled. Existing upstream IDs and credentials
are not migrated automatically.

| Operation                                                 | Standalone                               | Bridge   |
| --------------------------------------------------------- | ---------------------------------------- | -------- |
| Customer management and external ID lookup                | Implemented                              | Upstream |
| Setup links, dedicated and coexistence connections        | Implemented; requires Meta configuration | Upstream |
| Automatic number provisioning                             | 501; no carrier pool                     | Upstream |
| Send text, template, buttons, image and document messages | Direct Meta                              | Upstream |
| Template list/create/delete                               | Direct Meta, bound WABA only             | Upstream |
| Message history                                           | Local records with opaque cursor         | Upstream |
| Phone webhook list/create/delete                          | Persistent signed outbox                 | Upstream |
| URL-to-resumable media ingest                             | 501; use a Meta sample handle externally | Upstream |
| Managed billing and credit line                           | Not implemented                          | Upstream |

Standalone history is ordered by ingestion timestamp and retains provider event
time. Historical coexistence snapshots are exposed separately through `/v1/events`.

## Verification

`pnpm test:contract` exercises message, template, customer, phone, setup, webhook
and media requests against a local fake upstream server. It checks routing,
authentication and payload compatibility without contacting a production service.

Go integration tests use PostgreSQL and fake Meta endpoints for isolation,
idempotency, duplicate source handling, monotonic delivery state, signatures,
outbox delivery, encrypted credentials and hosted onboarding.

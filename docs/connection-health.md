# Connection diagnostics

`GET /v1/connections/{id}/health` returns a cached report or performs an initial
check. `POST` refreshes it, subject to a five-second per-connection cooldown. All
lookups use the authenticated project and the connection's encrypted Meta token.

Checks cover token validity and required scopes (when instance app credentials are
configured), phone access, account review, app subscription, global app webhook
verification and Meta's `health_status`. The worker checks up to five due connected
numbers every fifteen-second tick; reports become due after ten minutes. Provider
latency can extend that interval. A database advisory lock prevents overlapping
checks of the same number across processes.

`pass`, `fail`, `warning` and `unknown` are distinct. Missing provider information,
network failures and unavailable fields do not become successful checks. Meta
payment errors such as 141006 surface as billing attention with a management link.
No balance, debt, funding or credit-line state is inferred from a successful phone
lookup. Billing remains unknown when Meta does not expose a payment issue. A
healthy diagnostic is not a guarantee that a future message will be accepted.

SIP/calling-only errors are excluded: calling is not offered by the console.
Payment and incomplete business-verification issues are `warning` checks, with
Spanish action instructions and the original evidence in `provider_error`.
Payment warnings concern business-initiated messages, not necessarily replies.
Other provider restrictions remain `fail`; `LIMITED` remains `warning` and
`UNAVAILABLE` remains `fail`.

The raw `can_send_message` value is preserved, independently of check severity.
When Meta returns aggregate `BLOCKED` with only payment/verification warnings and
optional calling errors, the messaging check is a warning, not a claim that all
messages are blocked. `BLOCKED` with only excluded calling errors is `unknown`,
never a successful check. Unexplained `BLOCKED` or other messaging restrictions
remain failures. No inference from connection status overrides provider evidence.
The console uses amber for warnings, red for failures and neutral for unknowns.
Existing cached reports adopt these rules on their next refresh (or manual check).

The phone lookup also reads Meta's `messaging_limit_tier`, stored on the
connection as `messaging_limit_tier`. A check that cannot read it keeps the last
known value. The compatibility phone record exposes it as
`whatsapp_business_manager_messaging_limit`.

The connection snapshot receives health status, issue count and last check time;
the console lists issues and links to the detailed report. Health problems do not
silently delete connections or replace their credentials. App webhook
verification records when the verification-token handshake succeeded and is bound
to the configured app ID, callback URL and verification-token hash. It applies to
new projects too. Legacy project verification is reported with `scope: project`
when no matching global verification exists; global checks use `scope: app`. WABA app
subscription is a separate check. These diagnostics do not send test messages or
change billing settings.

## Platform-compatible health

`GET /platform/v1/whatsapp/phone_numbers/{id}/health` answers the reference
platform's schema from the same cached report; it runs a check only when none is
cached and never refreshes one. Check mapping:

| Platform check         | Wapo check             |
| ---------------------- | ---------------------- |
| `phone_number_access`  | `phone_access`         |
| `token_validity`       | `access_token`         |
| `webhook_subscription` | `webhook_subscription` |
| `webhook_verified`     | `webhook_verification` |
| `messaging_health`     | `messaging_health`     |

`passed` is true only for `pass`; `warning` and `fail` are `passed: false` with an
English `error`, and `details` carries Wapo's status, message and provider
evidence. An `unknown` check is omitted: Wapo never reports an unconfirmed check
as passed, and a missing webhook verification must not make every number look
degraded. `messaging_health.overall_status` and each entity's `can_send_message`
are Meta's `AVAILABLE`, `LIMITED` or `BLOCKED` (`UNAVAILABLE` is reported as
`BLOCKED`). Entities come from Meta's `health_status`; `additional_info` joins
Meta's notes and error descriptions, excluding calling-only errors. Reports
cached before this mapping existed have no entities until their next refresh.
The entity snapshot is stored as `meta_health` in the cached report and is not
part of the native response.

The top-level `status` is `unhealthy` when the native report is `error`, `error`
when Meta did not confirm access to the number (or no check could complete),
`degraded` for a native `warning` or a non-`AVAILABLE` messaging state, and
`healthy` otherwise.

Provider reference: [Meta's health-status response example](https://www.postman.com/meta/whatsapp-business-platform/documentation/y5swede/moved-whatsapp-flows-api?entity=request-24926895-857346e5-b0b0-484f-a501-ab27d30cf0dc).

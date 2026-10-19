# Connection diagnostics

`GET /v1/connections/{id}/health` returns a cached report or performs an initial
check. `POST` refreshes it, subject to a five-second per-connection cooldown. All
lookups use the authenticated project and the connection's encrypted Meta token.

Checks cover token validity and required scopes (when instance app credentials are
configured), phone access, account review, app subscription, project webhook
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

The connection snapshot receives health status, issue count and last check time;
the console lists issues and links to the detailed report. Health problems do not
silently delete connections or replace their credentials. Project webhook
verification records when Meta's verification-token handshake succeeded; WABA app
subscription is a separate check. These diagnostics do not send test messages or
change billing settings.

Provider reference: [Meta's health-status response example](https://www.postman.com/meta/whatsapp-business-platform/documentation/y5swede/moved-whatsapp-flows-api?entity=request-24926895-857346e5-b0b0-484f-a501-ab27d30cf0dc).

# Wapo development

Read README.md, CONTRIBUTING.md and relevant docs before modifying a domain.
Keep changes in this repository; external applications are compatibility references
unless the user explicitly requests modifying them. Do not read or copy other projects' secrets.

Use Go for the backend and PostgreSQL as the source of truth. Keep frontend
screens/components, API endpoint concerns and connector code in focused files.
Update OpenAPI and compatibility documentation alongside API changes.

Run meaningful unit, PostgreSQL integration and UI checks for changes. Automated
tests must use fake external providers, never send real messages. Run formatting,
ESLint, TypeScript, builds and Go vet before delivery. Preserve tenant isolation,
credential encryption, idempotency and durable event/outbox transactions.

The visual reference is Mailcheap's light monochrome dashboard. Implement the
style with original code; do not import its application source or branding.

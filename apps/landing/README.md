# Wapo landing

Static Astro site for the public Wapo landing, privacy policy and data-deletion
instructions required by Meta.

English is the default language (`/`), with Spanish at `/es` and Portuguese at
`/pt`. The previous `/en` entry redirects to `/`. Shared copy and localized routes
live in `src/i18n.ts`. The language selector preserves the current page type.

| Language   | Privacy           | Data deletion           |
| ---------- | ----------------- | ----------------------- |
| English    | `/privacy`        | `/data-deletion`        |
| Spanish    | `/privacidad`     | `/eliminacion-de-datos` |
| Portuguese | `/pt/privacidade` | `/pt/exclusao-de-dados` |

English and Portuguese legal copy lives in `src/legal/`; the original Spanish
legal pages retain their URLs. All pages publish language alternates, with
English as `x-default`. Static hosts should serve Astro's generated redirect page
for `/en` (or configure an equivalent permanent HTTP redirect).

```bash
pnpm --filter @wapo/landing dev
pnpm --filter @wapo/landing build
pnpm test:landing
```

The build output is `apps/landing/dist` and can be published by any static host.
Set `PUBLIC_CONSOLE_URL` at build time to show a console sign-in CTA; when omitted,
the site uses the public contact email from `src/config.ts`.

Before using the legal URLs in a Meta app, verify the operator name, contact email,
location, actual providers, retention periods and deployed URLs against the hosted
installation. Self-hosted operators must replace the policy with their own details.

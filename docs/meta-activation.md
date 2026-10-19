# Activate WhatsApp with your own Meta app

This operator checklist covers the Meta dashboard and Wapo configuration. Dashboard
paths were observed on October 18, 2026; names and available steps vary by app.
Replace `APP_ID` and `BUSINESS_ID` in the URL recipes with your own values. Never
copy another installation's app secret, access token or setup link.

## 1. Choose who operates the installation

Wapo is open source. Installing it does not include a Meta app, business
verification, customer account access or provider approval.

| Deployment                                                           | Meta configuration and data responsibility                                                                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A business self-hosts for its own WhatsApp account                   | That business supplies its own Meta app and authorized account credentials. Start with the own-account API setup; follow the requirements Meta shows for its intended use. |
| An operator hosts Wapo and connects other businesses through its app | The operator configures Embedded Signup and completes the Tech Provider onboarding, verification and review requested by Meta. Customers authorize their own assets.       |
| Each user self-hosts with their own Meta app                         | Each operator repeats the applicable checklist. Repository maintainers do not automatically receive their messages or credentials.                                         |

Do not describe the repository as a centrally hosted service unless you actually
operate one. App Review answers must describe the installation using that Meta app:
its responsible person/entity, hosting providers, data practices and public URLs.
The open-source license does not answer these questions or waive Meta requirements.

## 2. Create the app and identify the assets

1. Open [Meta for Developers → My Apps](https://developers.facebook.com/apps/).
2. Choose **Create app**, select the WhatsApp messaging use case, and associate
   the business portfolio you control. For an existing app, open **Use cases
   (Casos de uso)** and customize WhatsApp.
3. Open **App settings → Basic (Configuración de la aplicación → Información
   básica)**. Copy App ID and reveal App Secret into the server environment only.
4. Complete the required icon, category, contact email, privacy policy URL and
   data-deletion instructions/URL. Use truthful, public pages for this installation.
5. Open WhatsApp **API Setup (Configuración de la API)** to locate the WABA ID,
   Phone Number ID and available test credentials. A temporary test token can expire.

These identifiers are different: App ID identifies the application; business
portfolio ID identifies the business; WABA ID identifies a WhatsApp Business
Account; Phone Number ID identifies its number; Configuration ID identifies a
Facebook Login for Business configuration. A Wapo project ID is a local isolation
boundary and appears in its webhook callback.

## 3. Enroll when connecting customer businesses

In the app, open **Use cases → WhatsApp → Customize → Quickstart (Inicio rápido)**.
Look for **Become a Tech Provider (Hazte proveedor de tecnología)** and
**Continue onboarding (Continuar incorporación)**. The observed flow offers
**Independent Tech Provider** and a route working with a Solution Partner. Choose
the route matching your actual arrangement; independent onboarding does not mean
you must first become a Solution Partner. The owner reviews and accepts Meta's
provider terms.

Continue to **Onboarding (Incorporación)**. Complete business verification for
the associated portfolio and inspect the App Review requirements. Verification,
provider enrollment, permission approval and app publication are separate steps.

Navigation recipes for dashboards that hide these entries:

```text
# WhatsApp quickstart
https://developers.facebook.com/apps/APP_ID/use_cases/customize/wa-dev-quickstart/?product_route=whatsapp-business&business_id=BUSINESS_ID&use_case_enum=WHATSAPP_BUSINESS_MESSAGING&selected_tab=wa-dev-quickstart
# Provider onboarding
https://developers.facebook.com/apps/APP_ID/use_cases/customize/onboard/?product_route=whatsapp-business&business_id=BUSINESS_ID&use_case_enum=WHATSAPP_BUSINESS_MESSAGING&selected_tab=onboard
# Review drafts and submissions
https://developers.facebook.com/apps/APP_ID/app-review/submissions/?business_id=BUSINESS_ID
```

If the onboarding page is blank, try the quickstart route and check enrollment.
In the observed session, the pagelet redirected to quickstart and reported error
1007; completing provider enrollment made onboarding accessible. This is an
observed recovery, not a universal explanation for error 1007.

## 4. Create a WhatsApp signup configuration

1. Open **Facebook Login for Business → Configurations (Configuraciones)**.
2. Create a WhatsApp Embedded Signup configuration. After enrollment, also check
   **WhatsApp → Embedded Signup Builder (Creador de registro insertado)**.
3. Choose the WhatsApp assets/permissions and signup variation offered for your
   use case. Coexistence needs the Business App onboarding variation and an eligible
   number. A generic Facebook login configuration alone is insufficient.
4. Save and copy Configuration ID into `META_EMBEDDED_SIGNUP_CONFIG_ID`.
5. In **Facebook Login for Business → Settings (Ajustes)**, enable the JavaScript
   SDK login option and add the HTTPS origin serving Wapo's `/setup` page to
   **Allowed Domains for the JavaScript SDK**.
6. In **App settings → Basic → App Domains**, add that hostname without scheme
   or path. Configure OAuth redirect URIs as required by the selected Meta flow;
   the webhook callback is not an OAuth redirect URI.

If a configuration only exposes general login settings or signup never offers
WhatsApp assets, recheck enrollment, the WhatsApp use case and Builder eligibility.
Receiving a Facebook authorization code alone does not prove Embedded Signup
finished. Wapo also needs the WhatsApp session event identifying the WABA.

## 5. Configure Wapo and public HTTPS

Follow the environment table and commands at [the served setup guide](http://localhost:8080/docs#meta-setup).
Use `META_APP_ID`, `META_APP_SECRET`, `META_EMBEDDED_SIGNUP_CONFIG_ID`,
`META_VERIFY_TOKEN`, `META_GRAPH_VERSION`, `PUBLIC_URL` and `WEB_ORIGIN`.
Generate your own verification token with `openssl rand -hex 32`.

For a local API already listening on port 8080, an installed Cloudflare CLI can
provide a temporary development URL:

```bash
cloudflared tunnel --url http://localhost:8080 --no-autoupdate
```

Set `PUBLIC_URL` to the printed HTTPS origin. Keep the tunnel running; if its
hostname changes, update Wapo, Meta domains and callback configuration. A tunnel
to the API does not expose the console on port 5173. Use stable public API and
console URLs for reviewer access. `WEB_ORIGIN` controls Wapo CORS, not Meta SDK access.
After changing the server environment, recreate the services:

```bash
docker compose up -d --build migrate api worker
```

In **Wapo → Configuration → WhatsApp**, verify configuration and copy the selected
project's callback: `https://api.example.com/hooks/meta/PROJECT_ID`. In Meta's
WhatsApp webhook configuration, enter this callback and the same verification
token, then choose **Verify and save**. Subscribe to `messages`, `account_update`
and template lifecycle fields needed by your integration. For Coexistence, also
subscribe to `smb_message_echoes`, `history` and `smb_app_state_sync` where available.
See [template lifecycle](template-lifecycle.md) for the implemented template events.
Wapo subscribes the authorized WABA with a project callback override during setup.

Configuration presence, successful webhook verification, WABA app subscription and
permission approval are different checks. Use [connection diagnostics](connection-health.md)
to inspect each connection after authorization.

## 6. Make a real test connection

For an existing Cloud API number, open **Wapo → Connections → Connect WhatsApp →
Use Meta credentials** and provide its authorized token, Phone Number ID and WABA
ID. For longer-lived server access, configure the system user, app and WhatsApp
asset assignments in [Business settings](https://business.facebook.com/settings/).
Do not put a connection token into global App Secret or Configuration ID fields.

For customer signup, create a customer and a setup link in Wapo, open the link,
choose dedicated or Coexistence, and finish the Meta account/number authorization.
Use an app-role user and eligible test assets while access is restricted.
[Onboarding behavior and API examples](whatsapp-onboarding.md) describe completion,
credential renewal and partial failures.

Check token/account access, app subscription and messaging health. Send a permitted
test message to a recipient you control, verify receipt in WhatsApp and confirm
its status in Wapo. Also test incoming messages and template creation/listing.
A connected token does not prove the number can send: account payment or messaging
restrictions can still block delivery. Fix the restriction shown by Meta rather
than repeatedly running signup.

## 7. Prepare and submit App Review

Open **Review → App Review (Revisión → Revisión de la aplicación)** or choose
**Edit App Review** in provider onboarding. Inspect the actual submission list:
an onboarding card saying “In review” does not prove submission if the detail says
**Not submitted (Sin enviar)**.

Complete the review sections:

1. **Verification:** confirm the portfolio's required verification is approved.
2. **App configuration:** complete required basic settings and public policy pages.
3. **Allowed usage (Uso permitido):** explain `whatsapp_business_messaging` for
   sending/receiving business conversations and `whatsapp_business_management` for
   authorized account assets, numbers, templates and webhook subscriptions. Review
   `public_profile` and any other permission actually requested by your configuration.
   Do not request unrelated permissions or claim unimplemented features.
4. Upload separate recordings for the WhatsApp permissions when requested. Show
   the real Wapo UI sending a message and its receipt in WhatsApp for messaging;
   show template creation and the relevant management workflow for management.
   Demonstrate authorization/account selection as requested by the review form.
   Use test data and hide secrets. Mocked browser tests are not review evidence.
5. Make the required successful API test calls. The observed form required at
   least one call for each WhatsApp permission and warned that recognition may
   take up to 24 hours. Follow the counters shown for your app.
6. **Data handling (Gestión de datos):** identify actual service providers with
   access, the responsible person/entity and country. Answer the questions about
   government requests over the last 12 months and implemented handling policies
   truthfully. Do not select safeguards merely because you plan to add them.
7. **Reviewer instructions:** provide a reachable deployment, dedicated test
   access and exact steps to reproduce the recorded flows. Ensure reviewers can
   access it without your local machine, expiring tunnel or personal session.
8. Save the draft, review the declarations, then submit when every requirement is
   satisfied. Check the submission status and any follow-up requests. Complete
   **Publish (Publicar)** requirements before inviting external customers.

Open-source wording to adapt: “Wapo is open-source messaging software. This Meta
app is operated by [entity] for [its own account / businesses using this hosted
installation]. Other self-hosted installations use their own credentials and
infrastructure.” This does not replace an explanation of actual data use.

## Troubleshooting and completion criteria

CSP blocks on external `/events?cee=no` requests initiated by `fbevents.js` and
unknown Permissions-Policy features appeared during setup. Those console entries
alone did not establish the cause of the dashboard failure. Check the failed
functional request, enrollment and account state; do not disable browser security.
For signup returning only a login code, recheck step 4. For failing callbacks,
check public HTTPS, project ID, matching verification token and recreated services.

Completion means a real authorized account, successful sending and receiving,
working callbacks and required template/Coexistence behavior, plus the approvals
and published state required for the intended users. Local tests and saved
credentials alone do not establish production approval.

References: [Meta's provider sample](https://github.com/fbsamples/business-messaging-sample-tech-provider-app),
[Embedded Signup overview](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview),
[Business App onboarding](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users).

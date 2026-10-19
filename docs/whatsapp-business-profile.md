# WhatsApp Business profile

Each WhatsApp phone number has a public business profile visible to people in the
WhatsApp conversation header. Wapo reads and updates that profile directly through
Meta; PostgreSQL does not keep a second editable copy.

## Console

Open **Connections → connection → Profile**. Administrators and members can edit:

- About text (1–139 characters);
- description (up to 512 characters);
- address (up to 256 characters);
- contact email;
- business category;
- up to two HTTP(S) websites.

The page always reloads the provider profile after a successful update. Provider
validation and permission errors remain visible to the operator.

The current profile picture is displayed but cannot yet be uploaded from the
console. Meta requires a separate resumable-upload flow to create a
`profile_picture_handle`. API consumers that already have such a handle can pass it
to the native update endpoint.

## Native API

```bash
curl "$WAPO_URL/v1/connections/CONNECTION_ID/business-profile" \
  -H "X-API-Key: $WAPO_API_KEY"
```

```bash
curl -X PATCH "$WAPO_URL/v1/connections/CONNECTION_ID/business-profile" \
  -H "X-API-Key: $WAPO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "about": "Atendemos todos los días",
    "description": "Soporte y ventas por WhatsApp",
    "email": "soporte@example.com",
    "vertical": "PROF_SERVICES",
    "websites": ["https://example.com"]
  }'
```

The connection ID is Wapo's project-scoped resource ID, not Meta's phone number ID.
Wapo resolves the encrypted connection credential and sends the request only to the
phone number owned by that project.

## Meta-compatible API

Existing integrations can continue using the Graph-shaped proxy:

```text
GET  /meta/whatsapp/v24.0/{phone_number_id}/whatsapp_business_profile
POST /meta/whatsapp/v24.0/{phone_number_id}/whatsapp_business_profile
```

The native endpoint adds local validation and a connection-scoped identifier; the
compatible endpoint preserves Meta request and response shapes.

import { test, expect, env } from './fixtures'

test('inbox uses the 24-hour state machine and responsive conversation layout', async ({
  page,
}) => {
  test.setTimeout(45_000)
  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill(env.ADMIN_EMAIL)
  await page.getByLabel('Contraseña', { exact: true }).fill(env.ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  let windowOpen = false
  let sentTemplate: Record<string, unknown> | null = null
  const connection = {
    id: 'con_inbox_ui',
    name: 'Soporte',
    channel: 'whatsapp',
    status: 'connected',
    business_account_id: '123456',
    external_id: '654321',
    credential_status: 'valid',
  }
  const message = {
    id: 'wamid.inbound',
    connection_id: connection.id,
    conversation_id: 'conv_ui',
    channel: 'whatsapp',
    direction: 'inbound',
    status: 'received',
    from: '5491155550000',
    timestamp: new Date().toISOString(),
    payload: { type: 'text', text: { body: 'Hola, necesito ayuda' } },
  }
  const conversation = {
    id: 'conv_ui',
    connection_id: connection.id,
    channel: 'whatsapp',
    contact: '5491155550000',
    contact_name: 'Ana Cliente',
    status: 'open',
    assigned_to: '',
    last_message: message,
    updated_at: new Date().toISOString(),
    service_window_open: windowOpen,
  }

  await page.route('**/v1/conversations**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())

    if (url.pathname === '/v1/conversations') {
      await route.fulfill({
        json: { data: [{ ...conversation, service_window_open: windowOpen }] },
      })
    } else if (url.pathname.endsWith('/messages')) {
      await route.fulfill({ json: { data: [message] } })
    } else if (request.method() === 'PATCH') {
      await route.fulfill({ json: { data: conversation } })
    } else {
      await route.fulfill({
        json: {
          data: {
            ...conversation,
            service_window_open: windowOpen,
            ...(windowOpen
              ? {
                  service_window_expires_at: new Date(
                    Date.now() + 60 * 60 * 1000,
                  ).toISOString(),
                }
              : {}),
          },
        },
      })
    }
  })
  await page.route('**/v1/connections/con_inbox_ui/templates*', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: 'tpl_hello',
            name: 'hello_world',
            language: 'en_US',
            category: 'UTILITY',
            status: 'APPROVED',
            components: [{ type: 'BODY', text: 'Hello World' }],
          },
        ],
      },
    }),
  )
  await page.route('**/v1/connections/con_inbox_ui', (route) =>
    route.fulfill({ json: { data: connection } }),
  )
  await page.route('**/v1/messages', async (route) => {
    sentTemplate = route.request().postDataJSON()
    await route.fulfill({
      status: 201,
      json: {
        data: {
          ...message,
          id: 'wamid.outbound',
          direction: 'outbound',
          to: conversation.contact,
          from: undefined,
          display_text: 'Hello World',
        },
      },
    })
  })
  await page.getByRole('link', { name: 'Chats', exact: true }).click()
  await expect(
    page.getByRole('heading', { name: 'Inbox', exact: true }),
  ).toBeVisible()
  await page.getByRole('button', { name: /Ana Cliente/ }).click()
  await expect(
    page.getByText('Requiere template', { exact: true }),
  ).toBeVisible()
  await expect(page.getByLabel('Responder conversación')).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Enviar template', exact: true })
    .click()
  const templateDialog = page.getByRole('dialog', {
    name: 'Retomar conversación',
  })

  await expect(templateDialog.getByLabel('Destinatario')).toHaveValue(
    '5491155550000',
  )
  await templateDialog
    .getByRole('button', { name: 'Enviar template', exact: true })
    .click()
  await expect(templateDialog).not.toBeVisible()
  expect(sentTemplate).toMatchObject({
    connection_id: connection.id,
    payload: { type: 'template', template: { name: 'hello_world' } },
  })
  windowOpen = true
  await page.reload()
  await expect(page.getByLabel('Responder conversación')).toBeVisible()
  await expect(page.getByText('Ventana 24 h', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('button', { name: 'Volver a conversaciones' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Volver a conversaciones' }).click()
  await expect(
    page.getByRole('heading', { name: 'Inbox', exact: true }),
  ).toBeVisible()
})

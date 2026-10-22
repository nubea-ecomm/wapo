import { test, expect } from '@playwright/test'
import type { Message } from '../../packages/sdk/src/types'

test('inbox shows pending replies immediately and only marks actual read receipts blue', async ({
  page,
}) => {
  const user = {
    id: 'user',
    role: 'admin',
    all_projects: true,
    project_ids: [],
    email: 'test@example.com',
    name: 'Test',
    language: 'es',
    avatar_variant: 0,
    active: true,
    created_at: '',
  }

  await page.addInitScript((user) => {
    sessionStorage.setItem(
      'wapo.console-session',
      JSON.stringify({
        id: 'session',
        url: 'http://localhost:8080',
        key: 'fake-local-token',
        role: 'operator',
        tenantId: 'tenant',
        tenantName: 'Test',
        user,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      }),
    )
  }, user)
  const connection = {
    id: 'con',
    name: 'Test',
    channel: 'whatsapp',
    status: 'connected',
  }
  const messages: Message[] = [
    {
      id: 'incoming',
      connection_id: 'con',
      conversation_id: 'chat',
      channel: 'whatsapp',
      direction: 'inbound',
      status: 'received',
      timestamp: new Date().toISOString(),
      payload: { type: 'text', text: { body: 'Hola' } },
    },
  ]
  const conversation = () => ({
    id: 'chat',
    connection_id: 'con',
    channel: 'whatsapp',
    contact: '5491112345678',
    contact_name: 'Contacto de prueba',
    status: 'open',
    assigned_to: '',
    last_message: messages[0],
    updated_at: new Date().toISOString(),
    service_window_open: true,
    service_window_expires_at: new Date(Date.now() + 3600_000).toISOString(),
  })
  let release!: () => void
  const sendReady = new Promise<void>((resolve) => {
    release = resolve
  })

  await page.route(/\/(?:auth\/|admin\/)?v1\//, async (route) => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = []

    if (path === '/auth/v1/me') data = { user }
    else if (path === '/admin/v1/tenants')
      data = [{ id: 'tenant', name: 'Test', status: 'active' }]
    else if (path === '/v1/connections') data = [connection]
    else if (path === '/v1/connections/con') data = connection
    else if (path === '/v1/conversations') data = [conversation()]
    else if (path === '/v1/conversations/chat') data = conversation()
    else if (path === '/v1/conversations/chat/messages') {
      if (route.request().method() === 'POST') {
        await sendReady
        const body = route.request().postDataJSON() as { text: string }
        const sent: Message = {
          ...messages[0],
          id: 'outgoing',
          direction: 'outbound',
          status: 'sent',
          payload: { type: 'text', text: { body: body.text } },
        }

        messages.unshift(sent)
        await route.fulfill({ status: 201, json: { data: sent } })

        return
      }

      data = messages
    }

    await route.fulfill({ json: { data } })
  })
  await page.goto('/#/inbox?chat=chat')
  await expect(page.getByLabel('Responder conversación')).toBeVisible()
  await page.getByLabel('Responder conversación').fill('Respuesta inmediata')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  const timeline = page.locator('.timeline')

  await expect(timeline.getByText('Respuesta inmediata')).toBeVisible()
  await expect(timeline.getByLabel('Enviando', { exact: true })).toBeVisible()
  await expect(timeline.locator('.is-read')).toHaveCount(0)
  release()
  await expect(timeline.getByLabel('Enviado', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Responder conversación')).toHaveValue('')
  await expect(timeline.getByText('Respuesta inmediata')).toHaveCount(1)
  messages[0].status = 'delivered'
  await expect(timeline.getByLabel('Entregado', { exact: true })).toBeVisible({
    timeout: 4000,
  })
  await expect(timeline.locator('.is-read')).toHaveCount(0)
  messages[0].status = 'read'
  await expect(timeline.getByLabel('Leído', { exact: true })).toHaveClass(
    /is-read/,
    { timeout: 4000 },
  )
  messages.unshift({
    ...messages[1],
    id: 'new-incoming',
    payload: { type: 'text', text: { body: 'Nuevo mensaje sin recargar' } },
  })
  await expect(timeline.getByText('Nuevo mensaje sin recargar')).toBeVisible({
    timeout: 4000,
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('main')).toHaveCSS('margin-left', '0px')
  await expect(page.locator('.thread-header b')).toHaveText(
    'Contacto de prueba',
  )
  const contactSize = await page
    .locator('.thread-header b')
    .evaluate((element) => ({
      visible: element.clientWidth,
      content: element.scrollWidth,
    }))

  expect(contactSize.visible).toBeGreaterThan(0)
  expect(contactSize.content).toBeLessThanOrEqual(contactSize.visible)
  await expect(page.getByLabel('Responder conversación')).toBeVisible()
  await page.screenshot({
    path: 'artifacts/inbox-reactivity-mobile.png',
    animations: 'disabled',
  })
})

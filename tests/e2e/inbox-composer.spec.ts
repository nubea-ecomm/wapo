import { test, expect, type Page } from '@playwright/test'
import type { Message } from '../../packages/sdk/src/types'

async function mockInbox(page: Page) {
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

  await page.addInitScript(
    (user) =>
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
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }),
      ),
    user,
  )
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
      payload: {
        type: 'text',
        text: { body: 'Hola, ¿me pasás la información?' },
      },
    },
  ]
  const state = {
    unread: true,
    reads: [] as string[],
    sent: [] as Record<string, unknown>[],
    uploads: [] as string[],
  }
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
    has_unread: state.unread,
    last_inbound_message_id: 'incoming',
  })

  await page.route(/\/(?:auth\/|admin\/)?v1\//, async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname
    let data: unknown = []

    if (path === '/auth/v1/me') data = { user }
    else if (path === '/admin/v1/tenants')
      data = [{ id: 'tenant', name: 'Test', status: 'active' }]
    else if (path === '/v1/connections') data = [connection]
    else if (path === '/v1/connections/con') data = connection
    else if (path === '/v1/conversations') data = [conversation()]
    else if (path === '/v1/conversations/chat') data = conversation()
    else if (path === '/v1/conversations/chat/read') {
      state.reads.push(request.postDataJSON().message_id)
      state.unread = false
      data = conversation()
    } else if (path === '/v1/connections/con/media') {
      const multipart = request.postDataBuffer()?.toString() || ''

      state.uploads.push(multipart)
      const voice = multipart.includes('name="voice"\r\n\r\ntrue')

      data = {
        id: `media-${state.uploads.length}`,
        type: voice ? 'audio' : 'document',
        mime_type: voice ? 'audio/ogg' : 'application/pdf',
        filename: voice ? 'voice.ogg' : 'invoice.pdf',
        voice,
      }
    } else if (path === '/v1/conversations/chat/messages') {
      if (request.method() === 'POST') {
        const payload = request.postDataJSON().payload as Record<
          string,
          unknown
        >

        state.sent.push(payload)
        const message: Message = {
          ...messages[0],
          id: `sent-${state.sent.length}`,
          direction: 'outbound',
          status: 'sent',
          payload,
        }

        messages.unshift(message)
        await route.fulfill({ status: 201, json: { data: message } })

        return
      }

      data = messages
    }

    await route.fulfill({ json: { data } })
  })

  return state
}

test('composer formats text, uploads attachments, sends buttons and clears unread on opening', async ({
  page,
}) => {
  const state = await mockInbox(page)

  await page.goto('/#/inbox')
  await expect(page.getByLabel('Mensajes sin leer')).toBeVisible()
  await page.getByRole('button', { name: /Contacto de prueba/ }).click()
  await expect(page.getByLabel('Responder conversación')).toBeVisible()
  await expect(page.getByLabel('Mensajes sin leer')).toHaveCount(0)
  expect(state.reads).toEqual(['incoming'])
  const editor = page.getByLabel('Responder conversación')

  await editor.fill('Importante')
  await editor.selectText()
  await page.getByRole('button', { name: 'Negrita', exact: true }).click()
  await expect(editor).toHaveValue('*Importante*')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(
    page.locator('.timeline strong').filter({ hasText: 'Importante' }),
  ).toBeVisible()
  expect(state.sent[0]).toMatchObject({
    type: 'text',
    text: { body: '*Importante*' },
  })
  await page.getByLabel('Archivo adjunto').setInputFiles({
    name: 'invoice.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 fake'),
  })
  await editor.fill('Tu comprobante')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(page.locator('.timeline').getByText('invoice.pdf')).toBeVisible()
  expect(state.sent[1]).toMatchObject({
    type: 'document',
    document: {
      id: 'media-1',
      filename: 'invoice.pdf',
      caption: 'Tu comprobante',
    },
  })
  await page.getByRole('button', { name: 'Mensaje interactivo' }).click()
  const dialog = page.getByRole('dialog', {
    name: 'Enviar mensaje interactivo',
  })

  await dialog.getByLabel('Cuerpo del mensaje').fill('¿Cómo querés continuar?')
  await dialog.getByLabel('Opción 1', { exact: true }).fill('Ver pedido')
  await dialog.getByRole('button', { name: 'Agregar', exact: true }).click()
  await dialog
    .getByLabel('Opción 2', { exact: true })
    .fill('Hablar con soporte')
  await page.screenshot({
    path: 'artifacts/interactive-composer-light.png',
    animations: 'disabled',
  })
  await dialog.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(
    page.locator('.timeline').getByText('Ver pedido', { exact: true }),
  ).toBeVisible()
  expect(state.sent[2]).toMatchObject({
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: '¿Cómo querés continuar?' },
      action: {
        buttons: [
          { type: 'reply', reply: { title: 'Ver pedido' } },
          { type: 'reply', reply: { title: 'Hablar con soporte' } },
        ],
      },
    },
  })
  await page.reload()
  await expect(page.getByLabel('Responder conversación')).toBeVisible()
  await expect(page.getByLabel('Mensajes sin leer')).toHaveCount(0)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({
    path: 'artifacts/chat-composer-dark.png',
    animations: 'disabled',
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('main')).toHaveCSS('margin-left', '0px')
  await expect(page.getByRole('button', { name: 'Grabar audio' })).toBeVisible()
  await page.screenshot({
    path: 'artifacts/chat-composer-mobile.png',
    animations: 'disabled',
  })
})

test('records, previews and uploads a voice note and releases the microphone', async ({
  page,
}) => {
  const state = await mockInbox(page)

  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      value: async () => {
        const context = new AudioContext(),
          destination = context.createMediaStreamDestination(),
          oscillator = context.createOscillator()

        oscillator.connect(destination)
        oscillator.start()
        await context.resume()
        const track = destination.stream.getAudioTracks()[0]
        const originalStop = track.stop.bind(track)

        track.stop = () => {
          if (track.readyState === 'ended') return

          originalStop()
          oscillator.stop()
          void context.close()
        }

        return destination.stream
      },
    })
  })
  await page.goto('/#/inbox?chat=chat')
  await page.getByRole('button', { name: 'Grabar audio' }).click()
  await expect(page.getByText(/Grabando 00:01/)).toBeVisible()
  await page.getByRole('button', { name: 'Detener grabación' }).click()
  await expect(page.getByLabel('Vista previa del audio')).toBeVisible()
  await expect(page.getByText('Nota de voz lista para enviar.')).toBeVisible()
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(page.getByLabel('Vista previa del audio')).toHaveCount(0)
  expect(state.uploads[0]).toContain('audio/webm')
  expect(state.sent[0]).toMatchObject({
    type: 'audio',
    audio: { id: 'media-1', voice: true },
  })
  await page.getByRole('button', { name: 'Grabar audio' }).click()
  await expect(page.getByText(/Grabando/)).toBeVisible()
  await page.getByRole('button', { name: 'Cancelar grabación' }).click()
  await expect(page.getByLabel('Responder conversación')).toBeVisible()
  expect(state.sent).toHaveLength(1)
})

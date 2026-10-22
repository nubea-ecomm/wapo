import { test, expect } from '@playwright/test'
import type { Message, MessageReaction } from '../../packages/sdk/src/types'

test('chat layout, quoted replies, reactions and loaders remain stable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
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
          key: 'fake-token',
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
  const noon = new Date()

  noon.setHours(12, 0, 0, 0)
  const incoming: Message = {
    id: 'incoming',
    connection_id: 'con',
    conversation_id: 'chat',
    channel: 'whatsapp',
    direction: 'inbound',
    status: 'received',
    timestamp: new Date(noon.getTime() - 180_000).toISOString(),
    payload: {
      type: 'text',
      text: {
        body: 'Hola buenas tardes, te consulto si se puede ir y ver los productos. Gracias',
      },
    },
  }
  const outgoing: Message = {
    ...incoming,
    id: 'outgoing',
    direction: 'outbound',
    status: 'read',
    timestamp: new Date(noon.getTime() - 120_000).toISOString(),
    payload: {
      type: 'text',
      text: {
        body: '¡Hola! 👋\nGracias por comunicarte con *nuestra tienda*.\n\nPodés acercarte para conocer los productos.\n\n🕒 *Horarios*\n• Lunes a jueves: 10:00 a 17:00 hs\n• Viernes: 10:00 a 15:00 hs\n\n¡Te esperamos!',
      },
    },
  }
  const messages: Message[] = [
    outgoing,
    incoming,
    {
      ...incoming,
      id: 'yesterday',
      timestamp: new Date(noon.getTime() - 86400_000).toISOString(),
      payload: { type: 'text', text: { body: 'Primer contacto' } },
    },
  ]
  const reactions: Record<string, MessageReaction[]> = {}
  const sent: Record<string, unknown>[] = []
  let releaseList!: () => void, releaseMessages!: () => void
  const listReady = new Promise<void>((resolve) => {
    releaseList = resolve
  })
  const messagesReady = new Promise<void>((resolve) => {
    releaseMessages = resolve
  })
  const conversation = () => ({
    id: 'chat',
    connection_id: 'con',
    channel: 'whatsapp',
    contact: '5491112345678',
    contact_name: 'Ramiro Alvarez',
    status: 'open',
    assigned_to: '',
    last_message: messages[0],
    updated_at: new Date().toISOString(),
    service_window_open: true,
    service_window_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    has_unread: false,
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
    else if (path === '/v1/conversations') {
      await listReady
      data = [conversation()]
    } else if (path === '/v1/conversations/chat') data = conversation()
    else if (path === '/v1/conversations/chat/messages') {
      if (request.method() === 'POST') {
        const payload = request.postDataJSON().payload as Record<
          string,
          unknown
        >

        sent.push(payload)
        const message: Message = {
          ...outgoing,
          id: `sent-${sent.length}`,
          status: 'sent',
          timestamp: new Date().toISOString(),
          payload,
        }

        if (payload.type === 'reaction') {
          const reaction = payload.reaction as {
            message_id: string
            emoji: string
          }

          reactions[reaction.message_id] = reaction.emoji
            ? [
                {
                  emoji: reaction.emoji,
                  actor: 'business',
                  direction: 'outbound',
                  message_id: message.id,
                  status: 'sent',
                },
              ]
            : []
        } else {
          const context = payload.context as { message_id?: string } | undefined
          const parent = messages.find(
            (item) => item.id === context?.message_id,
          )

          if (parent)
            message.reply_to = {
              message_id: parent.id,
              direction: parent.direction,
              payload: parent.payload,
              unavailable: false,
            }

          messages.unshift(message)
        }

        await route.fulfill({ status: 201, json: { data: message } })

        return
      }

      await messagesReady
      data = messages.map((message) => ({
        ...message,
        reactions: reactions[message.id] || [],
      }))
    }

    await route.fulfill({ json: { data } })
  })
  await page.goto('/#/inbox?chat=chat')
  await expect(
    page.getByRole('status', { name: 'Cargando mensajes' }),
  ).toBeVisible()
  await expect(
    page.getByRole('status', { name: 'Cargando conversaciones' }),
  ).toBeVisible()
  await expect(
    page.locator('.thread-panel [data-slot="skeleton"]'),
  ).toHaveCount(0)
  const skeleton = await page
    .locator('.conversation-preview-skeleton')
    .first()
    .boundingBox()
  const skeletonAvatar = await page
    .locator('.conversation-skeleton-avatar')
    .first()
    .boundingBox()
  const skeletonBody = await page
    .locator('.conversation-preview-skeleton .conversation-preview-body')
    .first()
    .boundingBox()

  await page.screenshot({
    path: 'artifacts/chat-loading-aligned.png',
    animations: 'disabled',
  })
  releaseList()
  const preview = page.getByRole('button', { name: /Ramiro Alvarez/ })

  await expect(preview).toBeVisible()
  const loaded = await preview.boundingBox()
  const avatar = await preview.locator('.contact-avatar').boundingBox()
  const bodyBox = await preview
    .locator('.conversation-preview-body')
    .boundingBox()

  expect(Math.abs(avatar!.width - skeletonAvatar!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(avatar!.height - skeletonAvatar!.height)).toBeLessThanOrEqual(
    1,
  )
  expect(Math.abs(bodyBox!.x - skeletonBody!.x)).toBeLessThanOrEqual(1)

  expect(Math.abs(loaded!.height - skeleton!.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(loaded!.width - skeleton!.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(loaded!.y - skeleton!.y)).toBeLessThanOrEqual(1)
  releaseMessages()
  const original = page.locator('[data-message-id="incoming"]')

  await expect(original).toBeVisible()
  await expect(original.locator('.participant-avatar')).toHaveText('RA')
  await expect(page.locator('.chat-day-divider')).toHaveCount(2)
  await expect(page.locator('.chat-conversation-divider')).toHaveText(
    'Conversación chat',
  )
  await original.hover()
  await original
    .getByRole('button', { name: 'Responder a este mensaje' })
    .click()
  await expect(page.locator('.composer-reply')).toContainText(
    'se puede ir y ver los productos',
  )
  await page
    .getByLabel('Responder conversación')
    .fill('Sí, podés pasar cuando quieras.')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(page.locator('.composer-reply')).toHaveCount(0)
  expect(sent[0]).toMatchObject({ context: { message_id: 'incoming' } })
  await expect(
    page.locator('[data-message-id="sent-1"] .message-quote'),
  ).toContainText('se puede ir y ver los productos')
  await original.hover()
  await original
    .getByRole('button', { name: 'Reaccionar a este mensaje' })
    .click()
  await page.getByRole('button', { name: 'Reaccionar con 👍' }).click()
  await expect(original.getByLabel('👍: Vos', { exact: true })).toBeVisible()
  await expect(page.locator('.timeline article')).toHaveCount(4)
  expect(sent[1]).toMatchObject({
    type: 'reaction',
    reaction: { message_id: 'incoming', emoji: '👍' },
  })
  await original.hover()
  await original
    .getByRole('button', { name: 'Reaccionar a este mensaje' })
    .click()
  await page.getByRole('button', { name: 'Quitar reacción' }).click()
  await expect(original.locator('.reaction-chip')).toHaveCount(0)
  expect(sent[2]).toMatchObject({ reaction: { emoji: '' } })
  reactions.outgoing = [
    {
      emoji: '❤️',
      actor: 'contact',
      direction: 'inbound',
      message_id: 'received-reaction',
      status: 'received',
    },
  ]
  await expect(
    page
      .locator('[data-message-id="outgoing"]')
      .getByLabel('❤️: Ramiro Alvarez', { exact: true }),
  ).toBeVisible({ timeout: 4000 })
  await page.screenshot({
    path: 'artifacts/chat-history-light.png',
    animations: 'disabled',
  })
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.screenshot({
    path: 'artifacts/chat-history-dark.png',
    animations: 'disabled',
  })
  reactions.outgoing = [{ ...reactions.outgoing[0], emoji: '😮' }]
  await expect(
    page
      .locator('[data-message-id="outgoing"]')
      .getByLabel('😮: Ramiro Alvarez', { exact: true }),
  ).toBeVisible({ timeout: 4000 })
  reactions.outgoing = []
  await expect(
    page.locator('[data-message-id="outgoing"] .reaction-chip'),
  ).toHaveCount(0, { timeout: 4000 })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('main')).toHaveCSS('margin-left', '0px')
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
  await page.screenshot({
    path: 'artifacts/chat-history-mobile.png',
    animations: 'disabled',
  })
})

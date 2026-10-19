/** Compatibility requests use a fake upstream and never contact a production service. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

const image = process.env.WAPO_TEST_IMAGE || 'wapo-api'
const project = `contract-${randomUUID()}`
const apiKey = `test-${randomUUID()}`
const container = `wapo-contract-${randomUUID()}`
const requests = []
let templateId = 0
const upstream = createServer(async (req, res) => {
  let raw = ''

  for await (const chunk of req) raw += chunk

  assert.equal(req.headers['x-api-key'], 'fake-upstream-secret')
  assert.equal(req.headers.authorization, undefined)
  const body = raw ? JSON.parse(raw) : undefined

  requests.push({ method: req.method, url: req.url, body })
  res.setHeader('Content-Type', 'application/json')

  if (req.url.includes('/messages') && req.method === 'POST')
    return res.end(
      JSON.stringify({
        messaging_product: 'whatsapp',
        contacts: [{ input: body.to, wa_id: body.to }],
        messages: [{ id: 'wamid.contract' }],
      }),
    )

  if (req.url.includes('/message_templates'))
    return res.end(
      JSON.stringify(
        req.method === 'GET'
          ? {
              data: [
                {
                  id: 'template-1',
                  name: 'welcome',
                  status: 'APPROVED',
                  language: 'es_AR',
                  category: 'UTILITY',
                  components: [],
                },
              ],
            }
          : req.method === 'POST'
            ? {
                id: `template-${++templateId}`,
                status: 'PENDING',
                category: 'UTILITY',
              }
            : { success: true },
      ),
    )

  if (req.url.includes('/setup_links'))
    return res.end(
      JSON.stringify({
        data: { id: 'setup-1', url: 'https://fake.example/setup' },
      }),
    )

  if (req.url.includes('/whatsapp/media'))
    return res.end(
      JSON.stringify({
        data: {
          target: { kind: 'meta_resumable_asset', handle: 'sample-handle' },
        },
      }),
    )

  if (req.url.includes('/webhooks'))
    return res.end(
      JSON.stringify({
        data:
          req.method === 'GET'
            ? [
                {
                  id: 'wh-1',
                  url: 'https://client.example/upstream/webhook/messages',
                },
              ]
            : { id: 'wh-1' },
      }),
    )

  if (req.url.includes('/phone_numbers'))
    return res.end(
      JSON.stringify({
        data: {
          id: '123456',
          business_account_id: '654321',
          display_phone_number: '+123456',
          quality_rating: 'GREEN',
          whatsapp_business_manager_messaging_limit: 2000,
        },
      }),
    )

  res.end(
    JSON.stringify({
      data: { id: 'customer-1', external_customer_id: 'shop-1' },
    }),
  )
})

test(
  'messaging and Platform contracts through the optional upstream bridge',
  { timeout: 120_000 },
  async (t) => {
    await new Promise((resolve) => upstream.listen(0, '0.0.0.0', resolve))
    t.after(() => new Promise((resolve) => upstream.close(resolve)))
    const upstreamPort = upstream.address().port
    const docker = spawn(
      'docker',
      [
        'run',
        '--rm',
        '--name',
        container,
        '--network',
        'wapo_default',
        ...(process.platform === 'linux'
          ? ['--add-host', 'host.docker.internal:host-gateway']
          : []),
        '-p',
        '127.0.0.1::8080',
        '-e',
        'DATABASE_URL=postgres://wapo:wapo-local-only@postgres:5432/wapo?sslmode=disable',
        '-e',
        `BOOTSTRAP_PROJECT_ID=${project}`,
        '-e',
        `BOOTSTRAP_API_KEY=${apiKey}`,
        '-e',
        'ENCRYPTION_KEY=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
        '-e',
        'UPSTREAM_API_KEY=fake-upstream-secret',
        '-e',
        `UPSTREAM_BRIDGE_PROJECT_ID=${project}`,
        '-e',
        `UPSTREAM_PLATFORM_URL=http://host.docker.internal:${upstreamPort}/platform/v1`,
        '-e',
        `UPSTREAM_WHATSAPP_URL=http://host.docker.internal:${upstreamPort}/meta/whatsapp`,
        image,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let logs = ''

    docker.stdout.on('data', (b) => {
      logs += b
    })
    docker.stderr.on('data', (b) => {
      logs += b
    })
    t.after(() => {
      try {
        execFileSync('docker', ['stop', '-t', '2', container], {
          stdio: 'ignore',
        })
      } catch {}
    })
    let base

    for (let i = 0; i < 100; i++) {
      if (docker.exitCode !== null)
        throw new Error(`Contract API exited: ${logs}`)

      try {
        const port = execFileSync('docker', ['port', container, '8080/tcp'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
          .trim()
          .split(':')
          .at(-1)

        if (port && (await fetch(`http://127.0.0.1:${port}/readyz`)).ok) {
          base = `http://127.0.0.1:${port}`
          break
        }
      } catch {}

      await new Promise((resolve) => setTimeout(resolve, 200))
    }

    assert.ok(base, `API failed to become ready: ${logs}`)

    async function messaging(path, method = 'GET', body) {
      const res = await fetch(`${base}/meta/whatsapp/v24.0/${path}`, {
        method,
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(5000),
      })

      assert.ok(res.ok, `${method} ${path}: ${res.status}`)

      return res.json()
    }

    await messaging('123456/messages', 'POST', {
      messaging_product: 'whatsapp',
      to: '549111',
      type: 'text',
      text: { body: 'Hola' },
    })
    await messaging('123456/messages', 'POST', {
      messaging_product: 'whatsapp',
      to: '549111',
      type: 'template',
      template: {
        name: 'welcome',
        language: { code: 'es_AR' },
        components: [],
      },
    })
    await messaging('123456/messages', 'POST', {
      messaging_product: 'whatsapp',
      to: '549111',
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: 'Elegí' },
        action: {
          buttons: [{ type: 'reply', reply: { id: 'yes', title: 'Sí' } }],
        },
      },
    })
    await messaging('123456/messages', 'POST', {
      messaging_product: 'whatsapp',
      to: '549111',
      type: 'image',
      image: { link: 'https://example.com/image.jpg' },
    })
    await messaging('123456/messages', 'POST', {
      messaging_product: 'whatsapp',
      to: '549111',
      type: 'document',
      document: { link: 'https://example.com/a.pdf', filename: 'a.pdf' },
    })
    await messaging('654321/message_templates')
    await messaging('654321/message_templates', 'POST', {
      name: 'welcome',
      language: 'es_AR',
      category: 'UTILITY',
      components: [{ type: 'BODY', text: 'Hello' }],
    })
    await messaging('654321/message_templates?name=welcome', 'DELETE')

    async function platform(path, method = 'GET', body) {
      const res = await fetch(`${base}/platform/v1${path}`, {
        method,
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })

      assert.ok(res.ok, `${method} ${path}: ${res.status}`)

      return res.json()
    }

    const customer = await platform('/customers', 'POST', {
      customer: { name: 'Store', external_customer_id: 'shop-1' },
    })

    assert.equal(customer.data.id, 'customer-1')
    await platform('/customers?external_customer_id=shop-1')
    await platform('/customers/customer-1')
    assert.equal(
      (
        await platform('/customers/customer-1/setup_links', 'POST', {
          setup_link: { provision_phone_number: true, language: 'es' },
        })
      ).data.url,
      'https://fake.example/setup',
    )
    await platform('/whatsapp/phone_numbers?customer_id=customer-1')
    await platform('/whatsapp/phone_numbers/123456')
    await platform('/whatsapp/phone_numbers/123456/health')
    await platform('/whatsapp/phone_numbers/123456', 'PATCH', {
      whatsapp_phone_number: { inbound_processing_enabled: false },
    })
    await platform('/whatsapp/phone_numbers/123456/webhooks', 'POST', {
      whatsapp_webhook: {
        url: 'https://client.example/upstream/webhook/messages',
        secret_key: 'secret',
        events: ['whatsapp.message.delivered'],
      },
    })
    await platform('/whatsapp/phone_numbers/123456/webhooks')
    await platform('/whatsapp/phone_numbers/123456/webhooks/wh-1', 'DELETE')
    await platform(
      '/whatsapp/messages?phone_number_id=123456&direction=outbound&status=failed&limit=100',
    )
    assert.equal(
      (
        await platform('/whatsapp/media', 'POST', {
          media_ingest: {
            phone_number_id: '123456',
            source: 'https://example.com/image.jpg',
            delivery: 'meta_resumable_asset',
            filename: 'image.jpg',
            mime_type: 'image/jpeg',
          },
        })
      ).data.target.handle,
      'sample-handle',
    )
    await platform('/whatsapp/phone_numbers/123456', 'DELETE')
    await platform('/customers/customer-1', 'DELETE')
    const sends = requests.filter(
      (r) => r.url === '/meta/whatsapp/v24.0/123456/messages',
    )

    assert.equal(sends.length, 5)
    assert.equal(sends[0].body.text.body, 'Hola')
    assert.equal(sends[1].body.type, 'template')
    assert.equal(sends[2].body.interactive.action.buttons[0].reply.title, 'Sí')
    assert.ok(
      requests.some(
        (r) =>
          r.method === 'DELETE' &&
          r.url.includes('/654321/message_templates?name=welcome'),
      ),
    )
    console.log(
      `Verified ${requests.length} messaging/Platform requests; no production service contacted.`,
    )
  },
)

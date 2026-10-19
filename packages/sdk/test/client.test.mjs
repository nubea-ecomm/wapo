import { test } from 'node:test'
import assert from 'node:assert/strict'
import { WapoClient, WapoError } from '../dist/index.js'

test('send uses stable idempotency key, bounded request and project authentication', async () => {
  let captured
  const client = new WapoClient({
    baseUrl: 'https://wapo.example/',
    apiKey: 'test-key',
    fetch: async (url, init) => {
      captured = { url, init }

      return Response.json({ data: { id: 'msg-1' } }, { status: 201 })
    },
  })

  assert.equal(
    (await client.sendText('con-1', 'visitor', 'Hello', 'logical-send-1')).data
      .id,
    'msg-1',
  )
  assert.equal(captured.url, 'https://wapo.example/v1/messages')
  assert.equal(captured.init.headers['X-API-Key'], 'test-key')
  assert.equal(captured.init.headers['Idempotency-Key'], 'logical-send-1')
  assert.ok(captured.init.signal instanceof AbortSignal)
  assert.equal(captured.init.redirect, 'error')
  assert.equal(JSON.parse(captured.init.body).payload.text.body, 'Hello')
})
test('typed errors preserve status without automatic retries', async () => {
  let calls = 0
  const client = new WapoClient({
    baseUrl: 'https://wapo.example',
    apiKey: 'key',
    fetch: async () => {
      calls++

      return Response.json(
        { error: { code: 'send_unresolved' } },
        { status: 409 },
      )
    },
  })

  await assert.rejects(
    client.sendText('c', 'v', 'Hello', 'id'),
    (e) =>
      e instanceof WapoError &&
      e.status === 409 &&
      e.body.error.code === 'send_unresolved',
  )
  assert.equal(calls, 1)
  await assert.rejects(
    client.request('GET', 'https://other.example'),
    /relative API path/,
  )
})

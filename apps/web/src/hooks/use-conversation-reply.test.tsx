import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  WapoClient,
  WapoAdminClient,
  type Message,
} from '@nubea-ecomm/wapo-sdk'
import { expect, it, vi } from 'vitest'
import { SessionContext } from '../app/session-context'
import { useConversationReply } from './use-conversation-reply'

it('puts accepted replies in the timeline immediately and preserves drafts on errors without retrying', async () => {
  let finish!: (response: Response) => void
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve
      }),
  )
  const options = {
    baseUrl: 'https://api.example',
    apiKey: 'fake',
    fetch: fetcher,
  }
  const cache = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })
  const key = ['session', '/v1/conversations/chat/messages', 'pages']

  cache.setQueryData(key, { pages: [{ data: [] }], pageParams: [''] })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <SessionContext.Provider
      value={{
        session: {
          id: 'session',
          url: options.baseUrl,
          key: 'fake',
          role: 'project',
          tenantId: 'tenant',
          tenantName: 'Tenant',
        },
        client: new WapoClient(options),
        admin: new WapoAdminClient(options),
        connect: vi.fn(),
        connectUser: vi.fn(),
        selectTenant: vi.fn(),
        disconnect: vi.fn(),
        updateProfile: vi.fn(),
        refreshAccess: vi.fn(),
      }}
    >
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    </SessionContext.Provider>
  )
  const { result } = renderHook(() => useConversationReply('chat'), { wrapper })

  act(() => result.current.mutate({ text: 'Hello', key: 'stable-key' }))
  await waitFor(() => expect(result.current.isPending).toBe(true))
  expect(result.current.variables?.text).toBe('Hello')
  const message: Message = {
    id: 'msg',
    connection_id: 'con',
    conversation_id: 'chat',
    channel: 'whatsapp',
    direction: 'outbound',
    status: 'sent',
    timestamp: '2026-10-22T12:00:00Z',
    payload: { text: { body: 'Hello' } },
  }

  act(() => finish(Response.json({ data: message })))
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(cache.getQueryData(key)).toMatchObject({
    pages: [{ data: [message] }],
  })
  expect(fetcher).toHaveBeenCalledTimes(1)
  act(() =>
    result.current.mutate({ text: 'Keep this draft', key: 'second-key' }),
  )
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
  act(() =>
    finish(
      Response.json(
        { error: { code: 'send_unresolved', message: 'Unknown outcome' } },
        { status: 502 },
      ),
    ),
  )
  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.variables).toEqual({
    text: 'Keep this draft',
    key: 'second-key',
  })
  expect(cache.getQueryData(key)).toMatchObject({
    pages: [{ data: [message] }],
  })
  expect(fetcher).toHaveBeenCalledTimes(2)
})

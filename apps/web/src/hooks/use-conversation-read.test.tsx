import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, expect, it, vi } from 'vitest'
import type { Conversation } from '@nubea-ecomm/wapo-sdk'
import { useConversationRead } from './use-conversation-read'

const state = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('../app/session-context', () => ({
  useSession: () => ({
    session: { id: 'session' },
    client: { request: state.request },
  }),
}))
afterEach(() => {
  vi.restoreAllMocks()
  state.request.mockReset()
})

it('marks a focused visible chat read and clears only that reader cache entry', async () => {
  const conversation = {
    id: 'chat',
    has_unread: true,
    last_inbound_message_id: 'incoming',
  } as Conversation
  const cache = new QueryClient()
  const listKey = ['session', '/v1/conversations?status=open', 'pages']

  cache.setQueryData(listKey, {
    pages: [{ data: [conversation] }],
    pageParams: [''],
  })
  cache.setQueryData(['other-session', '/v1/conversations', 'pages'], {
    pages: [{ data: [conversation] }],
  })
  const focused = vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  const visibility = vi
    .spyOn(document, 'visibilityState', 'get')
    .mockReturnValue('hidden')

  state.request.mockResolvedValue({
    data: { ...conversation, has_unread: false },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  )

  renderHook(() => useConversationRead('chat', conversation, true, 1), {
    wrapper,
  })
  expect(state.request).not.toHaveBeenCalled()
  visibility.mockReturnValue('visible')
  focused.mockReturnValue(false)
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(state.request).not.toHaveBeenCalled()
  focused.mockReturnValue(true)
  act(() => window.dispatchEvent(new Event('focus')))
  await waitFor(() =>
    expect(state.request).toHaveBeenCalledWith(
      'POST',
      '/v1/conversations/chat/read',
      { message_id: 'incoming' },
    ),
  )
  await waitFor(() =>
    expect(cache.getQueryData(listKey)).toMatchObject({
      pages: [{ data: [{ has_unread: false }] }],
    }),
  )
  expect(
    cache.getQueryData(['other-session', '/v1/conversations', 'pages']),
  ).toMatchObject({ pages: [{ data: [{ has_unread: true }] }] })
})

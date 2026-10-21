import { useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { useAccessRefresh } from './use-access-refresh'
import type { Session } from './session-context'

afterEach(() => vi.unstubAllGlobals())

it('selects the newly joined project and ignores an older refresh response', async () => {
  const user = {
    id: 'user',
    name: 'User',
    email: 'user@example.com',
    active: true,
    role: 'member',
    all_projects: false,
    project_ids: ['old'],
    created_at: '2026-01-01T00:00:00Z',
  } as const
  const initial = {
    id: 'session',
    key: 'session-token',
    url: 'https://api.example',
    role: 'operator',
    tenantId: 'old',
    tenantName: 'Old',
    user,
  } as unknown as Session
  const stale: ((value: Response) => void)[] = []
  let calls = 0

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      calls++

      if (calls <= 2)
        return new Promise<Response>((resolve) => stale.push(resolve))

      if (url.endsWith('/auth/v1/me'))
        return Response.json({
          data: {
            user: {
              ...user,
              project_ids: ['old', 'joined'],
              project_roles: { old: 'viewer', joined: 'admin' },
            },
          },
        })

      return Response.json({
        data: [
          { id: 'old', name: 'Old', status: 'active' },
          { id: 'joined', name: 'Joined', status: 'active' },
        ],
      })
    }),
  )
  const queryClient = new QueryClient()
  const { result } = renderHook(() => {
    const [session, setSession] = useState<Session | null>(initial)
    const refresh = useAccessRefresh(session, setSession, queryClient)

    return { session, refresh }
  })

  await waitFor(() => expect(stale).toHaveLength(2))
  await act(() => result.current.refresh('joined'))
  expect(result.current.session?.tenantId).toBe('joined')
  expect(result.current.session?.user?.project_roles?.joined).toBe('admin')
  await act(async () => {
    stale[0](Response.json({ data: { user } }))
    stale[1](
      Response.json({ data: [{ id: 'old', name: 'Old', status: 'active' }] }),
    )
  })
  expect(result.current.session?.tenantId).toBe('joined')
  expect(result.current.session?.user?.project_roles?.joined).toBe('admin')
})

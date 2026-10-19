import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SessionProvider } from './session-provider'
import { useSession } from './session-context'
function Probe() {
  const { session, connect, selectTenant, client, disconnect } = useSession()
  return (
    <>
      <span>{session?.tenantId || 'disconnected'}</span>
      <button
        onClick={() => {
          void connect('https://api.example', 'operator-secret', 'operator')
        }}
      >
        Connect
      </button>
      <button onClick={() => selectTenant('tenant-b', 'B')}>Switch</button>
      <button
        onClick={() => {
          void client.me()
        }}
      >
        Request
      </button>
      <button onClick={disconnect}>Logout</button>
    </>
  )
}
afterEach(() => vi.unstubAllGlobals())
it('scopes operator requests explicitly and clears the session without persisting secrets', async () => {
  const calls: { url: string; headers: Record<string, string> }[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> })
      if (url.endsWith('/admin/v1/me'))
        return Response.json({ data: { role: 'operator' } })
      if (url.endsWith('/tenants'))
        return Response.json({ data: [{ id: 'tenant-a', name: 'A', status: 'active' }] })
      return Response.json({ data: { project_id: 'tenant-b' } })
    }),
  )
  const user = userEvent.setup()
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  )
  await user.click(screen.getByText('Connect'))
  await screen.findByText('tenant-a')
  await user.click(screen.getByText('Switch'))
  expect(screen.getByText('tenant-b')).toBeInTheDocument()
  await user.click(screen.getByText('Request'))
  await waitFor(() => expect(calls.at(-1)?.headers['X-Tenant-ID']).toBe('tenant-b'))
  expect(calls.at(-1)?.headers['X-API-Key']).toBe('operator-secret')
  expect(localStorage.length).toBe(0)
  expect(sessionStorage.length).toBe(0)
  await user.click(screen.getByText('Logout'))
  expect(screen.getByText('disconnected')).toBeInTheDocument()
})

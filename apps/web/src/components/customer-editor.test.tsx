import { it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WapoClient, WapoAdminClient } from '@wapo/sdk'
import { SessionContext } from '../app/session-context'
import { CustomerEditor } from './customer-editor'
it('rejects invalid customer metadata before making an API request', async () => {
  const fetcher = vi.fn()
  const client = new WapoClient({
    baseUrl: 'https://api.example',
    apiKey: 'key',
    fetch: fetcher,
  })
  const user = userEvent.setup()
  render(
    <SessionContext.Provider
      value={{
        session: {
          id: 's',
          url: 'https://api.example',
          key: 'key',
          tenantId: 'a',
          tenantName: 'A',
          role: 'project',
        },
        client,
        admin: new WapoAdminClient({ baseUrl: 'https://api.example', apiKey: 'key' }),
        connect: vi.fn(),
        connectUser: vi.fn(),
        disconnect: vi.fn(),
        selectTenant: vi.fn(),
      }}
    >
      <QueryClientProvider client={new QueryClient()}>
        <CustomerEditor onClose={vi.fn()} />
      </QueryClientProvider>
    </SessionContext.Provider>,
  )
  await user.type(screen.getByLabelText('Nombre'), 'Merchant')
  await user.clear(screen.getByLabelText('Metadata (JSON)'))
  await user.paste('[]')
  await user.click(screen.getByRole('button', { name: 'Guardar customer' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Metadata debe ser un objeto JSON',
  )
  expect(fetcher).not.toHaveBeenCalled()
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { WapoAdminClient, WapoClient } from '@nubea-ecomm/wapo-sdk'
import { SessionContext } from '../app/session-context'
import { ContactEditor } from './contact-editor'

describe('contact editor', () => {
  it('rejects non-object properties before calling the API', async () => {
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
            id: 'session',
            url: 'https://api.example',
            key: 'key',
            tenantId: 'project',
            tenantName: 'Project',
            role: 'project',
          },
          client,
          admin: new WapoAdminClient({
            baseUrl: 'https://api.example',
            apiKey: 'key',
          }),
          connect: vi.fn(),
          connectUser: vi.fn(),
          disconnect: vi.fn(),
          updateProfile: vi.fn(),
          selectTenant: vi.fn(),
        }}
      >
        <QueryClientProvider client={new QueryClient()}>
          <ContactEditor
            connections={[
              {
                id: 'connection',
                channel: 'whatsapp',
                status: 'connected',
                name: 'Sales',
              },
            ]}
            onClose={vi.fn()}
          />
        </QueryClientProvider>
      </SessionContext.Provider>,
    )

    await user.type(screen.getByLabelText('Número de WhatsApp'), '15551234567')
    await user.type(screen.getByLabelText('Nombre visible'), 'Ana')
    await user.clear(screen.getByLabelText('Propiedades'))
    await user.click(screen.getByLabelText('Propiedades'))
    await user.paste('[]')
    await user.click(screen.getByRole('button', { name: 'Guardar contacto' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Las propiedades deben ser un objeto JSON válido.',
    )
    expect(fetcher).not.toHaveBeenCalled()
  })
})

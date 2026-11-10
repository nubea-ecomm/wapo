import { expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WapoClient, WapoAdminClient } from '@nubea-ecomm/wapo-sdk'
import { SessionContext } from '../app/session-context'
import { ConnectionHealth } from './connection-health'
import { MotionProvider } from './motion/motion-provider'

it('distinguishes amber warnings, red failures and neutral unknowns with actions', async () => {
  const report = {
    status: 'error',
    checked_at: new Date().toISOString(),
    issues: 2,
    billing: {
      status: 'attention_required',
      manage_url: 'https://business.facebook.com/wa/manage/accounts/',
    },
    checks: [
      {
        id: 'billing',
        label: 'Pagos en Meta',
        status: 'warning',
        message:
          'Los mensajes iniciados por la empresa pueden verse afectados.',
        possible_solution: 'Revisá el método de pago de la cuenta de WhatsApp.',
        provider_error: { code: 141006, message: 'Payment method error' },
        manage_url: 'https://business.facebook.com/wa/manage/accounts/',
      },
      {
        id: 'messaging_health',
        label: 'Capacidad de envío',
        status: 'fail',
        message: 'Meta informa una restricción de mensajería.',
      },
      {
        id: 'webhook_verification',
        label: 'Verificación del webhook',
        status: 'unknown',
        message: 'Sin información.',
      },
    ],
  }
  const fetcher = vi
    .fn()
    .mockImplementation(async () => Response.json({ data: report }))
  const options = {
    baseUrl: 'https://api.example',
    apiKey: 'test-only',
    fetch: fetcher,
  }

  render(
    <SessionContext.Provider
      value={{
        session: {
          id: 's',
          url: options.baseUrl,
          key: options.apiKey,
          tenantId: 'project',
          tenantName: 'Project',
          role: 'project',
        },
        client: new WapoClient(options),
        admin: new WapoAdminClient(options),
        connect: vi.fn(),
        connectUser: vi.fn(),
        disconnect: vi.fn(),
        updateProfile: vi.fn(),
        refreshAccess: vi.fn(),
        selectTenant: vi.fn(),
      }}
    >
      <QueryClientProvider client={new QueryClient()}>
        <ConnectionHealth id="health-test" />
      </QueryClientProvider>
    </SessionContext.Provider>,
    { wrapper: MotionProvider },
  )
  expect(await screen.findByText('Advertencia')).toHaveClass('text-amber-700')
  expect(screen.getByText('Problema', { exact: true })).toHaveClass(
    'text-red-700',
  )
  expect(screen.getByText('Sin confirmar', { exact: true })).toHaveClass(
    'text-muted-foreground',
  )
  await waitFor(() => expect(screen.getByText('Qué hacer:')).toBeVisible())
  expect(screen.getByText(/Revisá el método de pago/)).toBeVisible()
  expect(screen.getByRole('link', { name: 'Revisar en Meta' })).toHaveAttribute(
    'href',
    report.billing.manage_url,
  )
  await userEvent.click(screen.getByText('Detalle de Meta'))
  expect(screen.getByText('141006: Payment method error')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: 'Comprobar ahora' }))
  await waitFor(() =>
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('/connections/health-test/health'),
      expect.objectContaining({ method: 'POST' }),
    ),
  )
})

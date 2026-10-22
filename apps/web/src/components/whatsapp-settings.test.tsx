import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { WhatsAppSettings } from './whatsapp-settings'
import { MotionProvider } from './motion/motion-provider'

const state = vi.hoisted(() => ({ project: 'project-a' }))

vi.mock('../app/session-context', () => ({
  useSession: () => ({
    session: {
      id: 'session',
      role: 'operator',
      tenantId: state.project,
      url: 'https://internal.example.com',
    },
  }),
}))
vi.mock('../hooks/use-api', () => ({
  useApi: (path: string) => ({
    isLoading: false,
    data: {
      data: path.includes('settings')
        ? {
            onboarding_ready: true,
            public_url: 'https://api.example.com/',
            callback_url: 'https://api.example.com/hooks/meta',
            public_https: true,
            graph_version: 'v26.0',
            credentials: {},
          }
        : { onboarding_ready: true },
    },
    refetch: vi.fn(),
  }),
}))

it('shows the same global callback across project switches and with no selected project', async () => {
  const { rerender } = render(
    <MotionProvider>
      <MemoryRouter>
        <WhatsAppSettings />
      </MemoryRouter>
    </MotionProvider>,
  )

  await waitFor(() =>
    expect(
      screen.getByText('https://api.example.com/hooks/meta'),
    ).toBeVisible(),
  )

  for (const project of ['project-b', '']) {
    state.project = project
    rerender(
      <MotionProvider>
        <MemoryRouter>
          <WhatsAppSettings />
        </MemoryRouter>
      </MotionProvider>,
    )
    expect(screen.getByText('https://api.example.com/hooks/meta')).toBeVisible()
    expect(
      screen.queryByText(/Seleccioná un proyecto para ver/),
    ).not.toBeInTheDocument()
  }
})

import {
  WapoAdminClient,
  WapoAuthClient,
  WapoClient,
} from '@nubea-ecomm/wapo-sdk'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { I18nContext, messages } from '../app/i18n'
import {
  SessionContext,
  type SessionContextValue,
} from '../app/session-context'
import { JoinProjectPage } from './join-project-page'

const es = messages.es
const preview = {
  email: 'invitee@example.com',
  project_name: 'Acme',
  role: 'member' as const,
  expires_at: '2030-01-01T00:00:00Z',
  account_exists: false,
}

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  location.hash = ''
})

function renderPage(overrides: Partial<SessionContextValue>) {
  const value: SessionContextValue = {
    refreshAccess: vi.fn().mockResolvedValue(undefined),
    session: null,
    client: new WapoClient({ baseUrl: 'https://api.example', apiKey: '' }),
    admin: new WapoAdminClient({ baseUrl: 'https://api.example', apiKey: '' }),
    connect: vi.fn(),
    connectUser: vi.fn().mockResolvedValue(undefined),
    registerUser: vi.fn().mockResolvedValue(undefined),
    selectTenant: vi.fn(),
    disconnect: vi.fn(),
    updateProfile: vi.fn(),
    ...overrides,
  }

  render(
    <SessionContext.Provider value={value}>
      <I18nContext.Provider
        value={{
          language: 'es',
          setLanguage: async () => {},
          t: (key) => messages.es[key],
        }}
      >
        <JoinProjectPage />
      </I18nContext.Provider>
    </SessionContext.Provider>,
  )

  return value
}

it('creates the account and joins the invited project in one step', async () => {
  location.hash = '#/join-project?token=invite_abc'
  vi.spyOn(WapoAuthClient.prototype, 'projectInvitation').mockResolvedValue({
    data: preview,
  })
  const value = renderPage({})
  const user = userEvent.setup()

  expect(await screen.findByText(`${es['auth.joinTo']} Acme`)).toBeTruthy()
  expect(screen.getByDisplayValue('invitee@example.com')).toBeTruthy()
  await user.type(screen.getByLabelText(es.name), 'Invitee')
  await user.type(screen.getByLabelText(es.password), 'invitee-password-123')
  await user.click(screen.getByRole('button', { name: es['auth.joinCreate'] }))
  expect(value.registerUser).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      email: 'invitee@example.com',
      name: 'Invitee',
      invitation_token: 'invite_abc',
    }),
    true,
  )
  expect(location.hash).toBe('#/')
  expect(localStorage.length).toBe(0)
})

it('signs an existing account in and joins with the invitation', async () => {
  location.hash = '#/join-project?token=invite_abc'
  vi.spyOn(WapoAuthClient.prototype, 'projectInvitation').mockResolvedValue({
    data: { ...preview, account_exists: true },
  })
  const value = renderPage({})
  const user = userEvent.setup()

  await user.type(await screen.findByLabelText(es.password), 'secret-pass')
  await user.click(screen.getByRole('button', { name: es['auth.joinSignIn'] }))
  expect(value.connectUser).toHaveBeenCalledWith(
    expect.any(String),
    'invitee@example.com',
    'secret-pass',
    true,
    'invite_abc',
  )
})

it('joins automatically when the invited account is already signed in', async () => {
  location.hash = '#/join-project?token=invite_abc'
  vi.spyOn(WapoAuthClient.prototype, 'projectInvitation').mockResolvedValue({
    data: { ...preview, account_exists: true },
  })
  const accept = vi
    .spyOn(WapoAuthClient.prototype, 'acceptProjectInvitation')
    .mockResolvedValue({ data: { project_id: 'tenant_acme', accepted: true } })
  const value = renderPage({
    session: {
      id: 'session',
      url: 'https://api.example',
      key: 'token',
      role: 'operator',
      tenantId: '',
      tenantName: '',
      user: {
        id: 'user',
        email: 'Invitee@example.com',
        name: 'Invitee',
        language: 'es',
        avatar_variant: 0,
        active: true,
        created_at: '',
        role: 'member',
        all_projects: false,
        project_ids: [],
      },
    },
  })

  await vi.waitFor(() =>
    expect(value.refreshAccess).toHaveBeenCalledWith('tenant_acme'),
  )
  expect(accept).toHaveBeenCalledTimes(1)
  await vi.waitFor(() => expect(location.hash).toBe('#/'))
})

it('explains when the invitation can no longer be used', async () => {
  location.hash = '#/join-project?token=used'
  const { WapoError } = await import('@nubea-ecomm/wapo-sdk')

  vi.spyOn(WapoAuthClient.prototype, 'projectInvitation').mockRejectedValue(
    new WapoError(410, {}),
  )
  renderPage({})
  expect(
    await screen.findByText(messages.es['auth.invitationUnavailable']),
  ).toBeTruthy()
})

it('shows the invitation as unavailable when it expires before submitting', async () => {
  location.hash = '#/join-project?token=invite_abc'
  vi.spyOn(WapoAuthClient.prototype, 'projectInvitation').mockResolvedValue({
    data: preview,
  })
  const { WapoError } = await import('@nubea-ecomm/wapo-sdk')

  renderPage({
    registerUser: vi.fn().mockRejectedValue(new WapoError(410, {})),
  })
  const user = userEvent.setup()

  await user.type(await screen.findByLabelText(es.name), 'Invitee')
  await user.type(screen.getByLabelText(es.password), 'invitee-password-123')
  await user.click(screen.getByRole('button', { name: es['auth.joinCreate'] }))
  expect(await screen.findByText(es['auth.invitationUnavailable'])).toBeTruthy()
  expect(localStorage.length).toBe(0)
})

import { WapoAdminClient, WapoClient } from '@nubea-ecomm/wapo-sdk'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { I18nContext, messages } from '../app/i18n'
import {
  SessionContext,
  type SessionContextValue,
} from '../app/session-context'
import { ProfileDialog } from './profile-dialog'

it('submits editable profile fields and the selected language', async () => {
  const updateProfile = vi.fn().mockResolvedValue(undefined)
  const onClose = vi.fn()
  const value: SessionContextValue = {
    refreshAccess: vi.fn(),
    session: {
      id: 'session',
      url: 'https://api.example',
      key: 'token',
      role: 'operator',
      tenantId: 'project',
      tenantName: 'Project',
      user: {
        id: 'user',
        email: 'before@example.com',
        name: 'Before',
        language: 'es',
        avatar_variant: 0,
        active: true,
        created_at: '',
        role: 'admin',
        all_projects: true,
        project_ids: [],
      },
    },
    client: new WapoClient({ baseUrl: 'https://api.example', apiKey: 'token' }),
    admin: new WapoAdminClient({
      baseUrl: 'https://api.example',
      apiKey: 'token',
    }),
    connect: vi.fn(),
    connectUser: vi.fn(),
    selectTenant: vi.fn(),
    disconnect: vi.fn(),
    updateProfile,
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
        <ProfileDialog onClose={onClose} />
      </I18nContext.Provider>
    </SessionContext.Provider>,
  )
  const user = userEvent.setup()

  await user.clear(screen.getByLabelText('Nombre'))
  await user.type(screen.getByLabelText('Nombre'), 'Updated')
  await user.click(screen.getByLabelText('Idioma'))
  await user.click(await screen.findByRole('option', { name: 'Português' }))
  await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  expect(updateProfile).toHaveBeenCalledWith({
    name: 'Updated',
    email: 'before@example.com',
    language: 'pt',
    avatar_variant: 0,
  })
  expect(onClose).toHaveBeenCalled()
})

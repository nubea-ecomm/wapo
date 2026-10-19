import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { I18nProvider } from './i18n-provider'
import { useI18n } from './i18n'
import { SessionContext, type SessionContextValue } from './session-context'

function Probe() {
  const { language, t } = useI18n()
  return (
    <span>
      {language}:{t('password')}
    </span>
  )
}

it('keeps Spanish as the stable language before authentication', () => {
  const value = {
    session: null,
    connect: vi.fn(),
    connectUser: vi.fn(),
    selectTenant: vi.fn(),
    disconnect: vi.fn(),
    updateProfile: vi.fn(),
  } as unknown as SessionContextValue
  render(
    <SessionContext.Provider value={value}>
      <I18nProvider>
        <Probe />
      </I18nProvider>
    </SessionContext.Provider>,
  )
  expect(screen.getByText('es:Contraseña')).toBeInTheDocument()
})

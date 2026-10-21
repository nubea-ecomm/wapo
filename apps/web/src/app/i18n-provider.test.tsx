import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { I18nProvider } from './i18n-provider'
import { useI18n } from './i18n'
import { SessionContext, type SessionContextValue } from './session-context'

function Probe() {
  const { language, t, setLanguage } = useI18n()

  return (
    <>
      <span>
        {language}:{t('password')}
      </span>
      <button onClick={() => void setLanguage('pt')}>Portuguese</button>
    </>
  )
}

function mount(profileLanguage?: 'es' | 'en' | 'pt') {
  const value = {
    session: profileLanguage ? { user: { language: profileLanguage } } : null,
    updateProfile: vi.fn(),
  } as unknown as SessionContextValue

  return render(
    <SessionContext.Provider value={value}>
      <I18nProvider>
        <Probe />
      </I18nProvider>
    </SessionContext.Provider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR', 'en-US'])
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})
it('uses the first supported browser language before login', () => {
  mount()
  expect(screen.getByText('en:Password')).toBeInTheDocument()
  expect(document.documentElement.lang).toBe('en')
})
it('persists an explicit guest choice and gives the account preference precedence', async () => {
  const view = mount()

  await userEvent.setup().click(screen.getByText('Portuguese'))
  expect(screen.getByText('pt:Senha')).toBeInTheDocument()
  expect(localStorage.getItem('wapo-language')).toBe('pt')
  view.unmount()
  const restored = mount()

  expect(screen.getByText('pt:Senha')).toBeInTheDocument()
  restored.unmount()
  mount('es')
  expect(screen.getByText('es:Contraseña')).toBeInTheDocument()
})

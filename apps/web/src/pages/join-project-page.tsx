import { useState } from 'react'
import { WapoAuthClient } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { ErrorNotice } from '../components/ui'
import { Button } from '../components/ui/button'
import { LoginPage } from './login-page'
import { useI18n } from '../app/i18n'

export function JoinProjectPage() {
  const { t } = useI18n()
  const { session } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (!session)
    return (
      <>
        <p className="p-4 text-center text-sm">{t('auth.joinHelp')}</p>
        <LoginPage />
      </>
    )

  async function accept() {
    if (!session) return

    setBusy(true)
    setError(null)

    try {
      const token =
        new URLSearchParams(location.hash.split('?')[1] || '').get('token') ||
        ''

      await new WapoAuthClient({
        baseUrl: session.url,
        apiKey: session.key,
      }).acceptProjectInvitation(token)
      window.dispatchEvent(new Event('focus'))
      location.hash = '#/'
    } catch (error) {
      setError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <section className="login-panel">
        <header>
          <h1>{t('auth.join')}</h1>
          <p>
            {t('auth.acceptAs')} {session.user?.email}
          </p>
        </header>
        <ErrorNotice error={error} />
        <Button
          disabled={busy}
          onClick={() => void accept()}
        >
          {busy ? t('auth.accepting') : t('auth.accept')}
        </Button>
        <a
          className="mt-4 block underline"
          href="#/"
        >
          {t('auth.back')}
        </a>
      </section>
    </main>
  )
}

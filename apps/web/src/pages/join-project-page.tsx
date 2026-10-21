import { useState } from 'react'
import { WapoAuthClient } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { ErrorNotice } from '../components/ui'
import { Button } from '../components/ui/button'
import { LoginPage } from './login-page'
import { useI18n } from '../app/i18n'
import { AuthLayout } from '../components/auth-layout'

export function JoinProjectPage() {
  const { t } = useI18n()
  const { session, refreshAccess, disconnect } = useSession()
  const [acceptedProject, setAcceptedProject] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (!session) return <LoginPage description={t('auth.joinHelp')} />

  async function accept() {
    if (!session) return

    setBusy(true)
    setError(null)

    try {
      const token =
        new URLSearchParams(location.hash.split('?')[1] || '').get('token') ||
        ''
      let project = acceptedProject

      if (!project) {
        const result = await new WapoAuthClient({
          baseUrl: session.url,
          apiKey: session.key,
        }).acceptProjectInvitation(token)

        project = result.data.project_id
        setAcceptedProject(project)
      }

      await refreshAccess(project)
      location.hash = '#/'
    } catch (error) {
      setError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.join')}
      description={
        <>
          {t('auth.acceptAs')} {session.user?.email}
        </>
      }
      footer={<a href="#/">{t('auth.back')}</a>}
      secondary={
        <Button
          variant="ghost"
          onClick={disconnect}
        >
          {t('signOut')}
        </Button>
      }
    >
      <ErrorNotice error={error} />
      <Button
        disabled={busy}
        onClick={() => void accept()}
      >
        {busy ? t('auth.accepting') : t('auth.accept')}
      </Button>
    </AuthLayout>
  )
}

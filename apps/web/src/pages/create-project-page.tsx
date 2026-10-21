import { useState } from 'react'
import { WapoAuthClient } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { ErrorNotice, Field } from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { AuthLayout } from '../components/auth-layout'
import { useI18n } from '../app/i18n'

export function CreateProjectPage() {
  const { t } = useI18n()
  const { session, refreshAccess, disconnect } = useSession()
  const [createdProject, setCreatedProject] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function create() {
    if (!session) return

    setBusy(true)
    setError(null)

    try {
      let project = createdProject

      if (!project) {
        const result = await new WapoAuthClient({
          baseUrl: session.url,
          apiKey: session.key,
        }).createProject(name)

        project = result.data.id
        setCreatedProject(project)
      }

      await refreshAccess(project)
    } catch (error) {
      setError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={t('auth.firstProject')}
      description={t('auth.projectDescription')}
      footer={<a href="#/?profile=security">{t('auth.security')}</a>}
      secondary={
        <Button
          variant="ghost"
          onClick={disconnect}
        >
          {t('signOut')}
        </Button>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <Field label={t('auth.projectName')}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={120}
          />
        </Field>
        <ErrorNotice error={error} />
        <Button disabled={busy}>
          {busy ? t('auth.creating') : t('auth.createProject')}
        </Button>
      </form>
    </AuthLayout>
  )
}

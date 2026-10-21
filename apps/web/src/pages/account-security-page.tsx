import { useState } from 'react'
import { useSession } from '../app/session-context'
import { useAction, useApi } from '../hooks/use-api'
import { ErrorNotice, Field, PageHeader } from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useI18n } from '../app/i18n'

export function AccountSecurityPage() {
  const { t } = useI18n()
  const { admin, disconnect } = useSession()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const sessions = useApi<{
    data: { id: string; expires_at: string; current: boolean }[]
  }>('/auth/v1/sessions', { admin: true })
  const change = useAction(async () => {
    await admin.request('POST', '/auth/v1/password', {
      current_password: currentPassword,
      password,
    })
    disconnect()
  })
  const revoke = useAction(async (id: string) => {
    await admin.request('DELETE', `/auth/v1/sessions/${id}`)
  })

  return (
    <>
      <PageHeader
        title={t('auth.security')}
        description={t('auth.securityDescription')}
      />
      <form
        className="form-stack max-w-md"
        onSubmit={(event) => {
          event.preventDefault()
          change.mutate()
        }}
      >
        <Field label={t('auth.currentPassword')}>
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </Field>
        <Field
          label={t('auth.newPassword')}
          hint={t('auth.changeHint')}
        >
          <Input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button disabled={change.isPending}>{t('auth.changePassword')}</Button>
      </form>
      <ErrorNotice error={change.error || sessions.error || revoke.error} />
      <h2 className="mt-8 mb-4 font-medium">{t('auth.sessions')}</h2>
      {sessions.data?.data.map((session) => (
        <div
          className="flex items-center justify-between border-b py-3"
          key={session.id}
        >
          <span>
            {session.current ? t('auth.thisSession') : t('auth.otherSession')} ·{' '}
            {t('auth.expires')} {new Date(session.expires_at).toLocaleString()}
          </span>
          <Button
            variant="outline"
            disabled={revoke.isPending}
            onClick={() =>
              revoke.mutate(session.id, {
                onSuccess: () => {
                  if (session.current) disconnect()
                },
              })
            }
          >
            {t('signOut')}
          </Button>
        </div>
      ))}
    </>
  )
}

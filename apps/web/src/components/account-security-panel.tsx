import { useState } from 'react'
import { useSession } from '../app/session-context'
import { useAction, useApi } from '../hooks/use-api'
import { ErrorNotice, Field, Loading } from './ui'
import { PasswordInput } from './password-input'
import { Button } from './ui/button'
import { Monitor } from 'lucide-react'
import { useI18n } from '../app/i18n'

export function AccountSecurityPanel() {
  const { t, language } = useI18n()
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
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          change.mutate()
        }}
      >
        <Field label={t('auth.currentPassword')}>
          <PasswordInput
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
          <PasswordInput
            strength
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button
          className="w-full"
          disabled={change.isPending}
        >
          {t('auth.changePassword')}
        </Button>
      </form>
      <ErrorNotice error={change.error || sessions.error || revoke.error} />
      <h2 className="mb-3 mt-6 border-t pt-5 text-sm font-medium">
        {t('auth.sessions')}
      </h2>
      {sessions.isLoading && <Loading />}
      {sessions.data?.data.map((session) => (
        <div
          className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border p-3"
          key={session.id}
        >
          <Monitor
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm font-medium">
              {session.current ? t('auth.thisSession') : t('auth.otherSession')}
            </p>
            <p className="m-0 text-xs text-muted-foreground">
              {t('auth.expires')}{' '}
              {new Intl.DateTimeFormat(language, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }).format(new Date(session.expires_at))}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
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

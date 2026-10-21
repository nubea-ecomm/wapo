import { useEffect, useState } from 'react'
import { AuthLayout } from '../components/auth-layout'
import { ErrorNotice, Field } from '../components/ui'
import { PasswordInput } from '../components/password-input'
import { Button } from '../components/ui/button'
import { useI18n } from '../app/i18n'

type Invitation = { name: string; email: string; expires_at: string }

export function AcceptInvitationPage() {
  const { t } = useI18n()
  const token = new URLSearchParams(location.hash.split('?')[1] || '').get(
    'token',
  )
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
  const [invitation, setInvitation] = useState<Invitation | null>(null)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!token) {
      setError(new Error(t('invitation.invalidLink')))

      return
    }

    void fetch(`${baseURL}/auth/v1/invitations/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(t('invitation.unavailable'))

        return (await response.json()) as { data: Invitation }
      })
      .then((response) => setInvitation(response.data))
      .catch(setError)
  }, [baseURL, token, t])

  return (
    <AuthLayout
      title={accepted ? t('invitation.acceptedTitle') : t('invitation.title')}
      description={
        accepted
          ? t('invitation.acceptedDescription')
          : invitation
            ? `${invitation.name}, ${t('invitation.createPasswordFor')} ${invitation.email}.`
            : t('invitation.verifying')
      }
    >
      {accepted ? (
        <Button
          className="w-full"
          asChild
        >
          <a href="/">{t('signInAction')}</a>
        </Button>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()

            if (!token) return

            setBusy(true)
            setError(null)
            void fetch(
              `${baseURL}/auth/v1/invitations/${encodeURIComponent(token)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
              },
            )
              .then((response) => {
                if (!response.ok)
                  throw new Error(
                    response.status === 422
                      ? t('invitation.passwordLength')
                      : t('invitation.unavailable'),
                  )

                setAccepted(true)
              })
              .catch(setError)
              .finally(() => setBusy(false))
          }}
        >
          {invitation && (
            <Field
              label={t('invitation.createPassword')}
              hint={t('invitation.passwordHint')}
            >
              <PasswordInput
                strength
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoFocus
              />
            </Field>
          )}
          <ErrorNotice error={error} />
          {invitation && (
            <Button
              className="w-full"
              disabled={busy}
            >
              {busy ? t('invitation.accepting') : t('invitation.accept')}
            </Button>
          )}
        </form>
      )}
    </AuthLayout>
  )
}

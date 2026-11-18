import { useState } from 'react'
import { WapoAuthClient } from '@nubea-ecomm/wapo-sdk'
import { AuthLayout } from '../components/auth-layout'
import { ErrorNotice, Field } from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useI18n } from '../app/i18n'
import { PasswordInput } from '../components/password-input'
import { useSession } from '../app/session-context'
import { resumePendingJoin } from '../app/pending-join'

export function AuthFlowPage({ flow }: { flow: string }) {
  const { t, language } = useI18n()
  const { registerUser } = useSession()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const registration = flow === '/register'
  const reset = flow === '/recover/end'
  const title = registration
    ? t('auth.registerTitle')
    : reset
      ? t('auth.newPassword')
      : t('auth.recover')

  async function submit() {
    setBusy(true)
    setError(null)
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'
    const client = new WapoAuthClient({ baseUrl: apiUrl, apiKey: '' })
    const query = new URLSearchParams(location.hash.split('?')[1] || '')

    try {
      if (registration) {
        // Creating the account signs the person in; there is no extra step.
        await registerUser(apiUrl, { name, email, password, language })
        location.hash = '#/'
        resumePendingJoin()

        return
      } else if (reset)
        await client.resetPassword(query.get('token') || '', password)
      else await client.recover(email)

      setDone(true)
    } catch (error) {
      setError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={title}
      description={
        done
          ? reset
            ? t('auth.resetDone')
            : t('auth.checkEmail')
          : registration
            ? t('auth.description')
            : reset
              ? t('auth.resetDescription')
              : t('auth.recoverDescription')
      }
      footer={
        registration && !done ? (
          <>
            {t('auth.haveAccount')} <a href="#/">{t('signInAction')}</a>
          </>
        ) : (
          <a href="#/">{t('auth.backToLogin')}</a>
        )
      }
    >
      {!done && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          {registration && (
            <Field label={t('name')}>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={120}
                required
              />
            </Field>
          )}
          {!reset && (
            <Field label="Email">
              <Input
                type="email"
                placeholder="m@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </Field>
          )}
          {(registration || reset) && (
            <Field
              label={t('password')}
              hint={t('auth.passwordHint')}
            >
              <PasswordInput
                strength
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={72}
                required
              />
            </Field>
          )}
          <ErrorNotice error={error} />
          <Button
            className="w-full"
            disabled={busy}
          >
            {busy ? t('common.processing') : title}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

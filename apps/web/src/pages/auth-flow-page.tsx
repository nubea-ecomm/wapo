import { useState } from 'react'
import { WapoAuthClient } from '@nubea-ecomm/wapo-sdk'
import { AuthLayout } from '../components/auth-layout'
import { ErrorNotice, Field } from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useI18n } from '../app/i18n'

export function AuthFlowPage({ flow }: { flow: string }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const registration = flow === '/register'
  const confirmation = flow === '/confirm'
  const reset = flow === '/recover/end'
  const title = registration
    ? t('auth.registerTitle')
    : confirmation
      ? t('auth.confirm')
      : reset
        ? t('auth.newPassword')
        : flow === '/recover'
          ? t('auth.recover')
          : t('auth.resend')

  async function submit() {
    setBusy(true)
    setError(null)
    const client = new WapoAuthClient({
      baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:8080',
      apiKey: '',
    })
    const query = new URLSearchParams(location.hash.split('?')[1] || '')

    try {
      if (registration) await client.register({ name, email, password })
      else if (confirmation) await client.confirm(query.get('cnf') || '')
      else if (reset)
        await client.resetPassword(query.get('token') || '', password)
      else if (flow === '/recover') await client.recover(email)
      else await client.resendConfirmation(email)

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
          ? confirmation
            ? t('auth.confirmed')
            : reset
              ? t('auth.resetDone')
              : t('auth.checkEmail')
          : registration
            ? t('auth.description')
            : confirmation
              ? t('auth.confirmDescription')
              : reset
                ? t('auth.resetDescription')
                : flow === '/recover'
                  ? t('auth.recoverDescription')
                  : t('auth.resendDescription')
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
          {!confirmation && !reset && (
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
              <Input
                type="password"
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

import { useState } from 'react'
import { useSession } from '../app/session-context'
import { useI18n } from '../app/i18n'
import { ErrorNotice, Field } from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Label } from '../components/ui/label'
import { AuthLayout } from '../components/auth-layout'
import { PasswordInput } from '../components/password-input'

export function LoginPage({ description }: { description?: string } = {}) {
  const { connectUser } = useSession()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  return (
    <AuthLayout
      title={t('signIn')}
      description={description || t('auth.loginDescription')}
      footer={
        <>
          {t('auth.noAccount')} <a href="#/register">{t('auth.register')}</a>
        </>
      }
      secondary={
        <a
          className="login-link"
          href="#/confirm/resend"
        >
          {t('auth.resend')}
        </a>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setBusy(true)
          setError(null)
          void connectUser(
            import.meta.env.VITE_API_URL || 'http://localhost:8080',
            email,
            password,
            remember,
          )
            .catch(() => setError(new Error(t('signInError'))))
            .finally(() => setBusy(false))
        }}
      >
        <Field label="Email">
          <Input
            type="email"
            placeholder="m@example.com"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoFocus
          />
        </Field>
        <div className="field">
          <div className="login-field-heading">
            <Label htmlFor="login-password">{t('password')}</Label>
            <a
              className="login-link"
              href="#/recover"
            >
              {t('auth.forgot')}
            </a>
          </div>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>
        <Label className="remember-session">
          <Checkbox
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          {t('remember')}
        </Label>
        <ErrorNotice error={error} />
        <Button
          className="w-full"
          disabled={busy}
        >
          {busy ? t('signingIn') : t('signInAction')}
        </Button>
      </form>
    </AuthLayout>
  )
}

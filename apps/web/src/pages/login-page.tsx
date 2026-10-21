import { m } from 'motion/react'
import { useState } from 'react'
import { useSession } from '../app/session-context'
import { useI18n } from '../app/i18n'
import { ErrorNotice, Field } from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Label } from '../components/ui/label'
import { WapoLogo } from '../components/wapo-logo'

export function LoginPage() {
  const { connectUser } = useSession()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  return (
    <main className="login">
      <m.div
        className="login-content"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <a
          className="login-brand"
          href="#/"
        >
          <WapoLogo />
        </a>
        <section className="login-panel">
          <header>
            <h1>{t('signIn')}</h1>
            <p>{t('signInDescription')}</p>
          </header>
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
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field label={t('password')}>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </Field>
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
          <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm underline underline-offset-4">
            <a href="#/register">{t('auth.register')}</a>
            <a href="#/recover">{t('auth.forgot')}</a>
            <a href="#/confirm/resend">{t('auth.resend')}</a>
          </div>
        </section>
      </m.div>
    </main>
  )
}

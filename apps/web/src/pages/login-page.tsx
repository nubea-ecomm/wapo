import { m } from 'motion/react'
import { useState } from 'react'
import { useSession } from '../app/session-context'
import { ErrorNotice, Field } from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Checkbox } from '../components/ui/checkbox'
import { Label } from '../components/ui/label'

export function LoginPage() {
  const { connectUser } = useSession()
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
        <a className="login-brand" href="#/">
          wapo
        </a>
        <h1>Iniciar sesión en Wapo</h1>
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
              .catch(() =>
                setError(
                  new Error(
                    'No pudimos iniciar sesión. Revisá tus credenciales e intentá de nuevo.',
                  ),
                ),
              )
              .finally(() => setBusy(false))
          }}
        >
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Contraseña">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          <Label className="remember-session">
            <Checkbox
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            Recordarme
          </Label>
          <ErrorNotice error={error} />
          <Button className="w-full" disabled={busy}>
            {busy ? 'Ingresando…' : 'Iniciar sesión'}
          </Button>
        </form>
        <p className="login-footer">Wapo</p>
      </m.div>
    </main>
  )
}

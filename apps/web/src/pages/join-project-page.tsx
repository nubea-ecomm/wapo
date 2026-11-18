import { useEffect, useRef, useState } from 'react'
import {
  WapoAuthClient,
  WapoError,
  type ProjectInvitationPreview,
} from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { ErrorNotice, Field } from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import { PasswordInput } from '../components/password-input'
import { useI18n } from '../app/i18n'
import { AuthLayout } from '../components/auth-layout'
import { forgetPendingJoin, rememberPendingJoin } from '../app/pending-join'
import { signInErrorMessage } from '../app/sign-in-error'

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080'

function invitationToken() {
  return (
    new URLSearchParams(location.hash.split('?')[1] || '').get('token') || ''
  )
}

function finish() {
  forgetPendingJoin()
  location.hash = '#/'
}

// One screen for the whole invitation: it shows the project and the invited
// email, then creates the account or signs in and joins in the same step. A
// signed-in invitee joins automatically.
export function JoinProjectPage() {
  const { t, language } = useI18n()
  const { session, connectUser, registerUser, refreshAccess, disconnect } =
    useSession()
  const [token] = useState(invitationToken)
  const [preview, setPreview] = useState<ProjectInvitationPreview | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [mode, setMode] = useState<'register' | 'login'>('register')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const autoAccepted = useRef(false)

  useEffect(() => {
    let cancelled = false

    new WapoAuthClient({ baseUrl: apiUrl, apiKey: '' })
      .projectInvitation(token)
      .then((result) => {
        if (cancelled) return

        setPreview(result.data)
        setMode(result.data.account_exists ? 'login' : 'register')
      })
      .catch((error: unknown) => {
        if (cancelled) return

        if (error instanceof WapoError && error.status < 500)
          setUnavailable(true)
        else setError(error)
      })

    return () => {
      cancelled = true
    }
  }, [token])

  const sameAccount =
    !!session?.user &&
    !!preview &&
    session.user.email.toLowerCase() === preview.email.toLowerCase()

  useEffect(() => {
    if (!session || !sameAccount || autoAccepted.current) return

    autoAccepted.current = true
    new WapoAuthClient({ baseUrl: session.url, apiKey: session.key })
      .acceptProjectInvitation(token)
      .then((result) => refreshAccess(result.data.project_id))
      .then(finish)
      .catch((error: unknown) => {
        if (error instanceof WapoError && error.status === 410)
          setUnavailable(true)
        else setError(error)
      })
  }, [session, sameAccount, token, refreshAccess])

  useEffect(() => {
    if (unavailable) forgetPendingJoin()
    else if (!session)
      rememberPendingJoin(`#/join-project?token=${encodeURIComponent(token)}`)
  }, [session, token, unavailable])

  if (unavailable)
    return (
      <AuthLayout
        title={t('auth.join')}
        description={t('auth.invitationUnavailable')}
        footer={<a href="#/">{t('auth.backToLogin')}</a>}
      >
        {null}
      </AuthLayout>
    )

  if (!preview)
    return (
      <AuthLayout
        title={t('auth.join')}
        description={error ? '' : t('common.processing')}
      >
        <ErrorNotice error={error} />
      </AuthLayout>
    )

  const title = `${t('auth.joinTo')} ${preview.project_name}`

  if (session && !sameAccount)
    return (
      <AuthLayout
        title={title}
        description={`${t('auth.invitationFor')} ${preview.email}. ${t('auth.switchAccount')}`}
        footer={<a href="#/">{t('auth.back')}</a>}
      >
        <Button
          className="w-full"
          onClick={() => {
            autoAccepted.current = false
            disconnect()
          }}
        >
          {t('signOut')}
        </Button>
      </AuthLayout>
    )

  if (session)
    return (
      <AuthLayout
        title={title}
        description={t('auth.joining')}
        footer={error ? <a href="#/">{t('auth.back')}</a> : undefined}
      >
        <ErrorNotice error={error} />
      </AuthLayout>
    )

  const invitation = preview
  const registering = mode === 'register'

  function switchMode(next: 'register' | 'login') {
    setError(null)
    setMode(next)
  }

  async function submit() {
    setBusy(true)
    setError(null)
    // This request joins the project itself; the signed-in path must not repeat it.
    autoAccepted.current = true

    try {
      if (registering)
        await registerUser(
          apiUrl,
          {
            name,
            email: invitation.email,
            password,
            language,
            invitation_token: token,
          },
          true,
        )
      else await connectUser(apiUrl, invitation.email, password, true, token)

      finish()
    } catch (error) {
      // The invitation can expire or be used between the preview and submit.
      if (error instanceof WapoError && error.status === 410)
        setUnavailable(true)
      else
        setError(registering ? error : new Error(t(signInErrorMessage(error))))

      autoAccepted.current = false
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title={title}
      description={`${t('auth.invitedAs')} ${invitation.email}`}
      footer={
        <>
          {registering ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
          <a
            href="#"
            onClick={(event) => {
              event.preventDefault()
              switchMode(registering ? 'login' : 'register')
            }}
          >
            {registering ? t('signInAction') : t('auth.register')}
          </a>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Field label="Email">
          <Input
            type="email"
            value={invitation.email}
            autoComplete="username"
            readOnly
          />
        </Field>
        {registering && (
          <Field label={t('name')}>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              maxLength={120}
              required
              autoFocus
            />
          </Field>
        )}
        <div className="field">
          <div className="login-field-heading">
            <Label htmlFor="join-password">{t('password')}</Label>
            {!registering && (
              <a
                className="login-link"
                href="#/recover"
              >
                {t('auth.forgot')}
              </a>
            )}
          </div>
          <PasswordInput
            id="join-password"
            strength={registering}
            autoComplete={registering ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={registering ? 12 : undefined}
            maxLength={registering ? 72 : undefined}
            autoFocus={!registering}
            required
          />
          {registering && <small>{t('auth.passwordHint')}</small>}
        </div>
        <ErrorNotice error={error} />
        <Button
          className="w-full"
          disabled={busy}
        >
          {busy
            ? t('common.processing')
            : registering
              ? t('auth.joinCreate')
              : t('auth.joinSignIn')}
        </Button>
      </form>
    </AuthLayout>
  )
}

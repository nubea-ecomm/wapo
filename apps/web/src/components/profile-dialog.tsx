import { useState, type FormEvent } from 'react'
import { Shuffle } from 'lucide-react'
import { WapoError } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { useI18n, type Language } from '../app/i18n'
import { FormDialog } from './form-dialog'
import { UserAvatar } from './user-avatar'
import { ErrorNotice, Field } from './ui'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'
import { nextAvatarVariant } from '../lib/avatar'

export function ProfileDialog({ onClose }: { onClose: () => void }) {
  const { session, updateProfile } = useSession()
  const { t } = useI18n()
  const user = session?.user
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [language, setLanguage] = useState<Language>(user?.language || 'es')
  const [avatar, setAvatar] = useState(user?.avatar_variant || 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  if (!user) return null

  function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    void updateProfile({ name, email, language, avatar_variant: avatar })
      .then(onClose)
      .catch((error) =>
        setError(new Error(profileUpdateError(error, t('profileError')))),
      )
      .finally(() => setBusy(false))
  }

  return (
    <FormDialog
      title={t('profile')}
      description={t('profileDescription')}
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={submit}
      >
        <div className="flex items-center gap-4 rounded-lg border p-3">
          <UserAvatar
            id={user.id}
            name={name || user.name}
            variant={avatar}
            className="size-14"
          />
          <div className="grid gap-1">
            <span className="text-sm font-medium">{t('avatar')}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAvatar(nextAvatarVariant(user.id, avatar))}
            >
              <Shuffle /> {t('anotherAvatar')}
            </Button>
          </div>
        </div>
        <Field label={t('name')}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            required
          />
        </Field>
        <Field label={t('email')}>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>
        <Field label={t('language')}>
          <NativeSelect
            value={language}
            onChange={(event) => setLanguage(event.target.value as Language)}
          >
            <option value="es">{t('spanish')}</option>
            <option value="pt">{t('portuguese')}</option>
            <option value="en">{t('english')}</option>
          </NativeSelect>
        </Field>
        <ErrorNotice error={error} />
        <Button disabled={busy}>{busy ? t('saving') : t('save')}</Button>
      </form>
    </FormDialog>
  )
}

function profileUpdateError(error: unknown, fallback: string) {
  if (!(error instanceof WapoError)) return fallback

  if (error.status === 405)
    return 'El servidor todavía no admite perfiles. Reiniciá el API.'

  if (error.status === 401) return 'La sesión venció. Volvé a iniciar sesión.'

  const body = error.body as { error?: { code?: string; message?: string } }

  if (body?.error?.code === 'already_exists') {
    return 'Ese correo electrónico ya pertenece a otro usuario.'
  }

  if (body?.error?.code === 'validation_error') {
    return body.error.message || fallback
  }

  return fallback
}

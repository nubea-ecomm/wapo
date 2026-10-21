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
import { Tabs } from 'radix-ui'
import { AccountSecurityPanel } from './account-security-panel'

export function ProfileDialog({
  onClose,
  initialTab = 'profile',
}: {
  onClose: () => void
  initialTab?: 'profile' | 'security'
}) {
  const { session, updateProfile } = useSession()
  const { t } = useI18n()
  const user = session?.user
  const [name, setName] = useState(user?.name || '')
  const [email, setEmail] = useState(user?.email || '')
  const [language, setLanguage] = useState<Language>(user?.language || 'es')
  const [avatar, setAvatar] = useState(user?.avatar_variant || 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [tab, setTab] = useState(initialTab)

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
      description={
        tab === 'security'
          ? t('auth.securityDescription')
          : t('profileDescription')
      }
      contentClassName="sm:max-w-lg"
      onClose={onClose}
    >
      <Tabs.Root
        value={tab}
        onValueChange={(value) => setTab(value as 'profile' | 'security')}
      >
        <Tabs.List
          aria-label={t('profile')}
          className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1"
        >
          <Tabs.Trigger
            value="profile"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            {t('profile.details')}
          </Tabs.Trigger>
          <Tabs.Trigger
            value="security"
            className="rounded-md px-3 py-2 text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
          >
            {t('profile.security')}
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content
          value="profile"
          className="profile-tab-panel outline-none"
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
                readOnly={!(user.all_projects && user.role === 'admin')}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </Field>
            <Field label={t('language')}>
              <NativeSelect
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as Language)
                }
              >
                <option value="es">{t('spanish')}</option>
                <option value="pt">{t('portuguese')}</option>
                <option value="en">{t('english')}</option>
              </NativeSelect>
            </Field>
            <ErrorNotice error={error} />
            <Button disabled={busy}>{busy ? t('saving') : t('save')}</Button>
          </form>
        </Tabs.Content>
        <Tabs.Content
          value="security"
          className="profile-tab-panel outline-none"
        >
          <AccountSecurityPanel />
        </Tabs.Content>
      </Tabs.Root>
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

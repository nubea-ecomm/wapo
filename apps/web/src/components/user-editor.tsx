import { UserAccessFields, type UserAccessValue } from './user-access-fields'
import { useState } from 'react'
import { PasswordInput } from './password-input'
import type { ConsoleUser } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { useAction, useApi } from '../hooks/use-api'
import { FormDialog } from './form-dialog'
import { Field, ErrorNotice, Loading } from './ui'
import { Input } from './ui/input'
import { Button } from './ui/button'

export function UserEditor({
  user,
  onClose,
}: {
  user?: ConsoleUser
  onClose: () => void
}) {
  const { admin, session, disconnect } = useSession()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [access, setAccess] = useState<UserAccessValue>({
    role: 'member',
    all_projects: false,
    project_ids: session?.tenantId ? [session.tenantId] : [],
  })
  const [password, setPassword] = useState('')
  const emailSettings = useApi<{ data: { smtp_configured: boolean } }>(
    '/admin/v1/settings/email',
    { admin: true },
  )
  const invitesByEmail = !user && emailSettings.data?.data.smtp_configured
  const save = useAction(async () => {
    if (user) {
      await admin.updateUser(user.id, { password })

      if (user.id === session?.user?.id) disconnect()
    } else
      await admin.createUser({
        name,
        email,
        ...(invitesByEmail ? {} : { password }),
        ...access,
      })

    onClose()
  })

  if (!user && emailSettings.isLoading)
    return (
      <FormDialog
        title="Invitar usuario"
        description="Verificando la configuración de email…"
        onClose={onClose}
      >
        <Loading variant="settings" />
      </FormDialog>
    )

  if (!user && emailSettings.error)
    return (
      <FormDialog
        title="Invitar usuario"
        description="No pudimos comprobar si el servidor puede enviar invitaciones."
        onClose={onClose}
      >
        <ErrorNotice error={emailSettings.error} />
      </FormDialog>
    )

  return (
    <FormDialog
      title={user ? 'Cambiar contraseña' : 'Invitar usuario'}
      description={
        user?.email ||
        (invitesByEmail
          ? 'Le enviaremos un email para que acepte la invitación y cree su contraseña.'
          : 'SMTP no está configurado; definí una contraseña inicial manualmente.')
      }
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        {!user && (
          <>
            <Field label="Nombre del usuario">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={120}
              />
            </Field>
            <Field label="Email del usuario">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
          </>
        )}
        {(user || !invitesByEmail) && (
          <Field
            label={user ? 'Contraseña nueva' : 'Contraseña inicial'}
            hint="Entre 12 y 72 caracteres. Cambiarla cierra las sesiones existentes."
          >
            <PasswordInput
              strength
              autoComplete="new-password"
              minLength={12}
              maxLength={72}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
        )}
        {!user && (
          <UserAccessFields
            value={access}
            onChange={setAccess}
          />
        )}
        <ErrorNotice error={save.error} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            disabled={
              save.isPending ||
              (!user && !access.all_projects && !access.project_ids.length)
            }
          >
            {save.isPending
              ? 'Guardando…'
              : invitesByEmail
                ? 'Enviar invitación'
                : 'Guardar usuario'}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}

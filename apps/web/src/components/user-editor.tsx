import { UserAccessFields, type UserAccessValue } from './user-access-fields'
import { useState } from 'react'
import type { ConsoleUser } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { FormDialog } from './form-dialog'
import { Field, ErrorNotice } from './ui'
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
  const save = useAction(async () => {
    if (user) {
      await admin.updateUser(user.id, { password })
      if (user.id === session?.user?.id) disconnect()
    } else await admin.createUser({ name, email, password, ...access })
    onClose()
  })
  return (
    <FormDialog
      title={user ? 'Cambiar contraseña' : 'Crear usuario'}
      description={user?.email}
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
        <Field
          label="Contraseña nueva"
          hint="Entre 12 y 72 caracteres. Cambiarla cierra las sesiones existentes."
        >
          <Input
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
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
            {save.isPending ? 'Guardando…' : 'Guardar usuario'}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}

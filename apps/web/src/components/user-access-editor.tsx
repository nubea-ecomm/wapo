import { useState } from 'react'
import type { ConsoleUser } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { FormDialog } from './form-dialog'
import { UserAccessFields, type UserAccessValue } from './user-access-fields'
import { ErrorNotice } from './ui'
import { Button } from './ui/button'
export function UserAccessEditor({
  user,
  onClose,
}: {
  user: ConsoleUser
  onClose: () => void
}) {
  const { admin, session, disconnect } = useSession()
  const [access, setAccess] = useState<UserAccessValue>({
    role: user.role || 'admin',
    all_projects: user.all_projects ?? true,
    project_ids: user.project_ids || [],
  })
  const save = useAction(async () => {
    await admin.updateUser(user.id, access)
    if (user.id === session?.user?.id) disconnect()
    onClose()
  })
  return (
    <FormDialog
      title="Editar acceso"
      description={user.email}
      onClose={onClose}
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <UserAccessFields
          value={access}
          onChange={setAccess}
        />
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
              (!access.all_projects && !access.project_ids.length)
            }
          >
            {save.isPending ? 'Guardando…' : 'Guardar acceso'}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}

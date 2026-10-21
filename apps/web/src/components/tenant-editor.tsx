import { useState } from 'react'
import { WapoAuthClient, type Project } from '@nubea-ecomm/wapo-sdk'
import { permissions } from '../app/permissions'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { FormDialog } from './form-dialog'
import { Field, ErrorNotice } from './ui'
import { Input } from './ui/input'
import { Button } from './ui/button'

export function TenantEditor({
  tenant,
  onClose,
}: {
  tenant?: Project
  onClose: () => void
}) {
  const { admin, session, selectTenant } = useSession()
  const [name, setName] = useState(tenant?.name || '')
  const save = useAction(async () => {
    if (tenant) {
      await admin.updateTenant(tenant.id, { name })

      if (session?.tenantId === tenant.id) selectTenant(tenant.id, name)
    } else if (permissions(session).canManagePlatform)
      await admin.createTenant(name)
    else if (session) {
      const result = await new WapoAuthClient({
        baseUrl: session.url,
        apiKey: session.key,
      }).createProject(name)

      selectTenant(result.data.id, result.data.name)
      window.dispatchEvent(new Event('focus'))
    }

    onClose()
  })

  return (
    <FormDialog
      title={tenant ? 'Renombrar proyecto' : 'Crear proyecto'}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <Field label="Nombre del proyecto">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre de la organización"
            required
            maxLength={120}
          />
        </Field>
        <ErrorNotice error={save.error} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button disabled={save.isPending}>
            {save.isPending
              ? 'Guardando…'
              : tenant
                ? 'Guardar cambios'
                : 'Crear proyecto'}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}

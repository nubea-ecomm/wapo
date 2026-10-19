import { useState } from 'react'
import type { Project } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { ErrorNotice } from './ui'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from './ui/alert-dialog'
export function TenantDeleteDialog({
  tenant,
  open,
  onOpenChange,
}: {
  tenant: Project
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { admin, session, selectTenant } = useSession()
  const [confirmation, setConfirmation] = useState('')
  const remove = useAction(async () => {
    await admin.deleteTenant(tenant.id)
    if (session?.tenantId === tenant.id) selectTenant('', '')
    onOpenChange(false)
  })
  return (
    <AlertDialog
      open={open}
      onOpenChange={(value) => {
        if (!remove.isPending) {
          onOpenChange(value)
          setConfirmation('')
          remove.reset()
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminar proyecto</AlertDialogTitle>
          <AlertDialogDescription>
            Se eliminará {tenant.name} y todos sus customers, conexiones, chats, mensajes,
            webhooks y eventos de Wapo. Sus claves dejarán de funcionar. Esta acción es
            permanente. Los números y cuentas externos se conservan.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <Label htmlFor={`delete-${tenant.id}`}>
            Escribí {tenant.name} para confirmar
          </Label>
          <Input
            id={`delete-${tenant.id}`}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            autoComplete="off"
          />
        </div>
        <ErrorNotice error={remove.error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={confirmation !== tenant.name || remove.isPending}
            onClick={(event) => {
              event.preventDefault()
              remove.mutate()
            }}
          >
            {remove.isPending ? 'Eliminando…' : 'Eliminar proyecto'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

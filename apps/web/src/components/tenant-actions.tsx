import { useState } from 'react'
import {
  MoreHorizontal,
  Pencil,
  Pause,
  Play,
  ArrowUpRight,
  Trash2,
  Settings2,
} from 'lucide-react'
import type { Project } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { ErrorNotice } from './ui'
import { Button } from './ui/button'
import { TenantDeleteDialog } from './tenant-delete-dialog'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu'
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

export function TenantActions({
  tenant,
  onOpen,
  onRename,
  onConfigure,
}: {
  tenant: Project
  onOpen: () => void
  onRename: () => void
  onConfigure: () => void
}) {
  const { admin, session, selectTenant } = useSession()
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const active = tenant.status === 'active'
  const toggle = useAction(async () => {
    await admin.updateTenant(tenant.id, {
      status: active ? 'suspended' : 'active',
    })

    if (active && session?.tenantId === tenant.id) selectTenant('', '')

    setToggling(false)
  })

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Acciones de ${tenant.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-44"
        >
          <DropdownMenuItem
            disabled={!active}
            onSelect={onOpen}
          >
            <ArrowUpRight />
            Abrir proyecto
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!active}
            onSelect={onConfigure}
          >
            <Settings2 />
            Configurar proyecto
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onRename}>
            <Pencil />
            Renombrar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              toggle.reset()
              setToggling(true)
            }}
          >
            {active ? <Pause /> : <Play />}
            {active ? 'Suspender' : 'Reactivar'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleting(true)}
          >
            <Trash2 />
            Eliminar proyecto
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TenantDeleteDialog
        tenant={tenant}
        open={deleting}
        onOpenChange={setDeleting}
      />
      <AlertDialog
        open={toggling}
        onOpenChange={(open) => {
          if (!toggle.isPending) setToggling(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {active ? 'Suspender proyecto' : 'Reactivar proyecto'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {active
                ? `Las claves de ${tenant.name} dejarán de funcionar hasta que lo reactives. Sus datos se conservan.`
                : `Se restablecerá el acceso por API de ${tenant.name}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ErrorNotice error={toggle.error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggle.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={toggle.isPending}
              onClick={(event) => {
                event.preventDefault()
                toggle.mutate()
              }}
            >
              {toggle.isPending
                ? 'Guardando…'
                : active
                  ? 'Suspender proyecto'
                  : 'Reactivar proyecto'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

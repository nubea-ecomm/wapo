import { useState } from 'react'
import type { ConsoleUser } from '@wapo/sdk'
import {
  MoreHorizontal,
  KeyRound,
  Trash2,
  UserCheck,
  UserX,
  Shield,
} from 'lucide-react'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { Button } from './ui/button'
import { ErrorNotice } from './ui'
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
export function UserActions({
  user,
  lastActive,
  onReset,
  onAccess,
}: {
  user: ConsoleUser
  lastActive: boolean
  onReset: () => void
  onAccess: () => void
}) {
  const { admin, session, disconnect } = useSession()
  const [action, setAction] = useState<'toggle' | 'delete' | null>(null)
  const change = useAction(async () => {
    if (action === 'delete') await admin.deleteUser(user.id)
    else await admin.updateUser(user.id, { active: !user.active })
    setAction(null)
    if (user.id === session?.user?.id && (action === 'delete' || user.active))
      disconnect()
  })
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Acciones de ${user.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onAccess}>
            <Shield />
            Editar acceso
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onReset}>
            <KeyRound />
            Cambiar contraseña
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={lastActive}
            onSelect={() => {
              change.reset()
              setAction('toggle')
            }}
          >
            {user.active ? <UserX /> : <UserCheck />}
            {user.active ? 'Desactivar' : 'Activar'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={lastActive}
            onSelect={() => {
              change.reset()
              setAction('delete')
            }}
          >
            <Trash2 />
            Eliminar usuario
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open && !change.isPending) setAction(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action === 'delete'
                ? 'Eliminar usuario'
                : user.active
                  ? 'Desactivar usuario'
                  : 'Activar usuario'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action === 'delete'
                ? `Se eliminará a ${user.name} (${user.email}) y se cerrarán todas sus sesiones. Esta acción es permanente.`
                : `${user.active ? 'Se desactivará' : 'Se activará'} el acceso de ${user.email} a la consola.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ErrorNotice error={change.error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={change.isPending}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              variant={action === 'delete' ? 'destructive' : 'default'}
              disabled={change.isPending}
              onClick={(event) => {
                event.preventDefault()
                change.mutate()
              }}
            >
              {change.isPending
                ? 'Guardando…'
                : action === 'delete'
                  ? 'Eliminar usuario'
                  : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

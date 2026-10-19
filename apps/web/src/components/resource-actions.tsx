import { useSession } from '../app/session-context'
import { permissions } from '../app/permissions'
import { ErrorNotice } from './ui'
import { useState, type ReactNode } from 'react'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
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

export function ResourceActions({
  name,
  actions = [],
  destructive,
}: {
  name: string
  actions?: { label: string; icon?: ReactNode; onSelect: () => void }[]
  destructive: {
    label: string
    description: string
    disabled?: boolean
    onConfirm: () => void | Promise<unknown>
  }
}) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const { session } = useSession()

  if (!permissions(session).canWrite) return null

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Acciones de ${name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.label}
              onSelect={action.onSelect}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          ))}
          {actions.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem
            variant="destructive"
            disabled={destructive.disabled}
            onSelect={() => setConfirming(true)}
          >
            <Trash2 />
            {destructive.label}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!pending) {
            setConfirming(open)
            setError(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{destructive.label}</AlertDialogTitle>
            <AlertDialogDescription>
              {destructive.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ErrorNotice error={error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={destructive.disabled || pending}
              onClick={async (event) => {
                event.preventDefault()
                setPending(true)
                setError(null)

                try {
                  await destructive.onConfirm()
                  setConfirming(false)
                } catch (error) {
                  setError(error)
                } finally {
                  setPending(false)
                }
              }}
            >
              {pending ? 'Procesando…' : 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

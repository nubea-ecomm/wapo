import { useSession } from '../app/session-context'
import { permissions } from '../app/permissions'
import { ContentSkeleton } from './content-skeleton'
import type { SkeletonVariant } from './content-skeleton'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from './ui/alert-dialog'
import { Card } from './ui/card'
import { Badge } from './ui/badge'
import { Label } from './ui/label'
import { Button } from './ui/button'
import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactNode,
} from 'react'
import { Inbox, AlertCircle } from 'lucide-react'
import { useI18n, type MessageKey } from '../app/i18n'

export function PageHeader({
  title,
  description,
  action,
  readOnlyAction = false,
}: {
  title: string
  description: string
  action?: ReactNode
  readOnlyAction?: boolean
}) {
  const { session } = useSession()
  const { canWrite } = permissions(session)

  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      {(canWrite || readOnlyAction) && action}
    </div>
  )
}

export function Panel({
  title,
  children,
  action,
  className = '',
}: {
  title?: ReactNode
  children: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <Card className={`panel gap-0 rounded-lg p-5 shadow-none ${className}`}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {action}
        </div>
      )}
      {children}
    </Card>
  )
}

export function Empty({
  title,
  children,
  icon,
}: {
  title: string
  children?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="mx-auto mb-3 flex size-10 items-center justify-center text-muted-foreground">
        {icon || <Inbox size={26} />}
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}

export function ErrorNotice({ error }: { error: unknown }) {
  return error ? (
    <div
      role="alert"
      className="notice error"
    >
      <AlertCircle size={16} />
      {error instanceof Error ? error.message : String(error)}
    </div>
  ) : null
}

export function Loading({ variant = 'list' }: { variant?: SkeletonVariant }) {
  return <ContentSkeleton variant={variant} />
}

export function Status({ value, label }: { value: string; label?: string }) {
  const { t } = useI18n()
  const statusKeys: Record<string, MessageKey> = {
    active: 'status.active',
    connected: 'status.connected',
    healthy: 'status.healthy',
    approved: 'status.approved',
    pending: 'status.pending',
    failed: 'status.failed',
    expired: 'status.expired',
    warning: 'status.warning',
    revoked: 'status.revoked',
    inactive: 'status.inactive',
    closed: 'status.closed',
  }
  const presentation = (
    {
      active: [
        'Activo',
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      ],
      connected: [
        'Conectada',
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      ],
      healthy: [
        'Saludable',
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      ],
      approved: [
        'Aprobado',
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      ],
      delivered: [
        'Entregado',
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      ],
      read: [
        'Leído',
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      ],
      completed: [
        'Completado',
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      ],
      used: [
        'Usado',
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      ],
      pass: [
        'Correcto',
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      ],
      configured: [
        'Configurado',
        'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
      ],
      onboarding: [
        'Configurando',
        'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
      ],
      processing: [
        'Procesando',
        'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
      ],
      queued: [
        'En cola',
        'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
      ],
      sent: [
        'Enviado',
        'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
      ],
      received: [
        'Recibido',
        'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300',
      ],
      pending: [
        'Pendiente',
        'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
      ],
      retrying: [
        'Reintentando',
        'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
      ],
      warning: [
        'Revisar',
        'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
      ],
      paused: [
        'Pausado',
        'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
      ],
      credential_expired: [
        'Token vencido',
        'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
      ],
      failed: [
        'Falló',
        'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
      ],
      rejected: [
        'Rechazado',
        'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
      ],
      disabled: [
        'Deshabilitado',
        'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
      ],
      expired: [
        'Vencido',
        'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
      ],
      onboarding_failed: [
        'Configuración fallida',
        'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
      ],
      error: [
        'Con problemas',
        'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
      ],
      suspended: [
        'Suspendido',
        'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
      ],
      revoked: [
        'Revocado',
        'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
      ],
      inactive: [
        'Inactivo',
        'border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300',
      ],
      disconnected: [
        'Desconectada',
        'border-border bg-muted/40 text-muted-foreground',
      ],
      closed: ['Cerrado', 'border-border bg-muted/40 text-muted-foreground'],
      cancelled: [
        'Cancelado',
        'border-border bg-muted/40 text-muted-foreground',
      ],
      unknown: [
        'Sin comprobar',
        'border-border bg-muted/40 text-muted-foreground',
      ],
    } as Record<string, [string, string]>
  )[value.toLowerCase()] || [
    value.replaceAll('_', ' '),
    'border-border bg-muted/40 text-muted-foreground',
  ]

  return (
    <Badge
      variant="outline"
      className={presentation[1]}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label ||
        (statusKeys[value.toLowerCase()]
          ? t(statusKeys[value.toLowerCase()])
          : presentation[0])}
    </Badge>
  )
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  const id = useId()

  return (
    <div className="field">
      <Label htmlFor={id}>{label}</Label>
      {isValidElement<{ id?: string }>(children)
        ? cloneElement(children, { id })
        : children}
      {hint && <small>{hint}</small>}
    </div>
  )
}

export function ConfirmButton({
  children,
  onConfirm,
  disabled,
  message,
}: {
  children: ReactNode
  onConfirm: () => void | Promise<unknown>
  disabled?: boolean
  message: string
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const { session } = useSession()

  if (!permissions(session).canWrite) return null

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) {
          setOpen(next)
          setError(null)
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          disabled={disabled}
        >
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar acción</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorNotice error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending || disabled}
            onClick={async (event) => {
              event.preventDefault()
              setPending(true)
              setError(null)

              try {
                await onConfirm()
                setOpen(false)
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
  )
}

export function LoadMore({
  available,
  busy,
  load,
}: {
  available: boolean
  busy: boolean
  load: () => void
}) {
  return available ? (
    <div className="load-more">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={load}
      >
        {busy ? 'Cargando…' : 'Cargar más'}
      </Button>
    </div>
  ) : null
}

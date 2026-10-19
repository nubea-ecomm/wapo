import {
  cloneElement,
  isValidElement,
  useId,
  useState,
  type ReactNode,
} from 'react'
import { Inbox, AlertCircle } from 'lucide-react'
import { useSession } from '../app/session-context'
import { permissions } from '../app/permissions'
import { ContentSkeleton, type SkeletonVariant } from './content-skeleton'
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
import { Label } from './ui/label'
import { Button } from './ui/button'
import { useI18n } from '../app/i18n'

export { Status } from './status'

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
  const { t } = useI18n()

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
          <AlertDialogTitle>{t('common.confirmAction')}</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <ErrorNotice error={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {t('common.cancel')}
          </AlertDialogCancel>
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
              } catch (caught) {
                setError(caught)
              } finally {
                setPending(false)
              }
            }}
          >
            {pending ? t('common.processing') : t('common.confirm')}
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
  const { t } = useI18n()

  return available ? (
    <div className="load-more">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={load}
      >
        {busy ? t('common.loading') : t('common.loadMore')}
      </Button>
    </div>
  ) : null
}

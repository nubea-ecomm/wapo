import type { ReactNode } from 'react'
import { cn } from '../lib/utils'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog'

export function FormDialog({
  title,
  description,
  onClose,
  children,
  contentClassName,
}: {
  title: ReactNode
  description?: string
  onClose: () => void
  children: ReactNode
  contentClassName?: string
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className={cn(
          'max-h-[90dvh] overflow-y-auto sm:max-w-xl',
          contentClassName,
        )}
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

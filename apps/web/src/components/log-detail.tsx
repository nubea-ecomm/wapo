import type { LogEntry } from '@wapo/sdk'
import { useApi } from '../hooks/use-api'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './ui/sheet'
import { Loading, ErrorNotice } from './ui'
import { CopyCode } from './copy-code'
import { LogSource } from './log-presentation'
import { logStatus } from '../lib/logs'

export function LogDetail({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  const detail = useApi<{ data: Record<string, unknown> }>(
    `/v1/logs/${encodeURIComponent(entry.id)}`,
  )
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Detalle del registro</SheetTitle>
          <SheetDescription>{entry.summary}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          <div className="flex items-center justify-between">
            <LogSource source={entry.source} />
            <span
              className={entry.is_error ? 'text-destructive' : 'text-muted-foreground'}
            >
              {logStatus(entry)}
            </span>
          </div>
          <dl className="grid grid-cols-[90px_1fr] gap-3 text-xs">
            <dt className="text-muted-foreground">Fecha</dt>
            <dd>{new Date(entry.created_at).toLocaleString('es-AR')}</dd>
            {entry.duration_ms !== null && (
              <>
                <dt className="text-muted-foreground">Duración</dt>
                <dd>{entry.duration_ms.toFixed(1)} ms</dd>
              </>
            )}
            {entry.request_id && (
              <>
                <dt className="text-muted-foreground">Request ID</dt>
                <dd className="break-all font-mono">{entry.request_id}</dd>
              </>
            )}
          </dl>
          {entry.source === 'webhooks' && (
            <p className="text-xs text-muted-foreground">
              Último estado de esta entrega.
            </p>
          )}
          {detail.isLoading && <Loading />}
          <ErrorNotice error={detail.error} />
          {detail.data && <CopyCode value={JSON.stringify(detail.data.data, null, 2)} />}
        </div>
      </SheetContent>
    </Sheet>
  )
}

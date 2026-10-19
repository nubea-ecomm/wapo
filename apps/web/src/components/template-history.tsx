import { useApi } from '../hooks/use-api'
import { ErrorNotice, Loading, Status } from './ui'
import { dateLabel } from '../lib/message-format'

type Snapshot = {
  status?: string
  category?: string
  scheduled_category?: string
  quality_score?: { score?: string }
}
type Change = {
  id: string
  event: string
  created_at: string
  data: { template: Snapshot; previous: Snapshot; source: string }
}
type VisibleChange = Change & { type: string; before: string; after: string }
const labels: Record<string, string> = {
  status_changed: 'Estado',
  category_changed: 'Categoría',
  quality_changed: 'Calidad',
  category_change_scheduled: 'Cambio programado',
}

export function TemplateHistory({
  connectionId,
  templateId,
}: {
  connectionId: string
  templateId: string
}) {
  const history = useApi<{ data: Change[] }>(
    `/v1/connections/${encodeURIComponent(connectionId)}/templates/${encodeURIComponent(templateId)}/history`,
    { poll: true },
  )
  const meaningful: VisibleChange[] = []
  const seen = new Set<string>()
  for (const change of history.data?.data || []) {
    const type = change.event.split('.').at(-1) || ''
    const key =
      type === 'status_changed'
        ? 'status'
        : type === 'category_changed'
          ? 'category'
          : 'scheduled_category'
    const before = String(
      type === 'quality_changed'
        ? change.data.previous.quality_score?.score || ''
        : change.data.previous[key] || '',
    )
    const after = String(
      type === 'quality_changed'
        ? change.data.template.quality_score?.score || ''
        : change.data.template[key] || '',
    )
    if (before === after || (!before && !after)) continue
    const signature = `${type}:${before}:${after}`
    if (seen.has(signature)) continue
    seen.add(signature)
    meaningful.push({ ...change, type, before, after })
  }
  return (
    <details
      className="rounded-lg border"
      aria-label="Historial del template"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
        <span>Historial</span>
        <span className="text-xs font-normal text-muted-foreground">
          {meaningful.length} {meaningful.length === 1 ? 'cambio' : 'cambios'}
        </span>
      </summary>
      <div className="max-h-72 overflow-y-auto border-t px-4">
        <ErrorNotice error={history.error} />
        {history.isLoading && <Loading />}
        {!history.isLoading && meaningful.length === 0 && (
          <p className="py-4 text-xs text-muted-foreground">
            Sin cambios relevantes desde la primera sincronización.
          </p>
        )}
        <ol className="divide-y">
          {meaningful.map((change) => (
            <li
              key={change.id}
              className="grid gap-2 py-3 sm:grid-cols-[120px_1fr_auto] sm:items-center"
            >
              <strong className="text-xs font-medium">
                {labels[change.type] || change.type}
              </strong>
              {change.type === 'status_changed' ? (
                <div className="flex items-center gap-2">
                  {change.before ? (
                    <Status value={change.before} />
                  ) : (
                    <span>—</span>
                  )}
                  <span className="text-muted-foreground">→</span>
                  {change.after ? (
                    <Status value={change.after} />
                  ) : (
                    <span>—</span>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {change.before || 'Sin registro'} →{' '}
                  {change.after || 'Sin dato'}
                </p>
              )}
              <time className="text-[11px] whitespace-nowrap text-muted-foreground">
                {dateLabel(change.created_at)}
              </time>
            </li>
          ))}
        </ol>
      </div>
    </details>
  )
}

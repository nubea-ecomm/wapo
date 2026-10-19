import { useApi } from '../hooks/use-api'
import { ErrorNotice, Loading } from './ui'
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
  return (
    <section className="mt-2 border-t pt-4" aria-label="Historial del template">
      <h3 className="mb-3 text-sm font-medium">Historial</h3>
      <ErrorNotice error={history.error} />
      {history.isLoading && <Loading />}
      {history.data?.data.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Sin cambios registrados desde la primera sincronización.
        </p>
      )}
      <ol className="space-y-3">
        {history.data?.data.map((change) => {
          const type = change.event.split('.').at(-1) || ''
          const key =
            type === 'status_changed'
              ? 'status'
              : type === 'category_changed'
                ? 'category'
                : 'scheduled_category'
          const before =
            type === 'quality_changed'
              ? change.data.previous.quality_score?.score
              : change.data.previous[key]
          const after =
            type === 'quality_changed'
              ? change.data.template.quality_score?.score
              : change.data.template[key]
          return (
            <li key={change.id} className="text-xs">
              <div className="flex justify-between gap-3">
                <strong className="font-medium">{labels[type] || type}</strong>
                <time className="text-muted-foreground">
                  {dateLabel(change.created_at)}
                </time>
              </div>
              <p className="mt-1 text-muted-foreground">
                {before || 'Sin registro'} → {after || 'Sin dato'}
              </p>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

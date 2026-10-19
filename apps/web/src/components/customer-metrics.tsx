import { lazy, Suspense, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useApi } from '../hooks/use-api'
import { Loading, ErrorNotice } from './ui'
import { Button } from './ui/button'
import { NativeSelect } from './ui/native-select'
import type { ActivityPoint } from './activity-chart'
const CustomerCharts = lazy(() => import('./customer-metrics-charts'))
export interface CustomerMetricsData {
  days: number
  outbound: number
  received: number
  sent: number
  delivered: number
  read: number
  failed: number
  pending: number
  connections: number
  connected: number
  conversations: number
  open_conversations: number
  connection_types: Record<'dedicated' | 'coexistence' | 'unknown', number>
  series: (ActivityPoint & { failed: number })[]
}
const number = (value: number) => new Intl.NumberFormat('es-AR').format(value)
const rate = (value: number, total: number) =>
  total ? `${((value / total) * 100).toFixed(1)}%` : '-'
export function CustomerMetrics({ customerId }: { customerId: string }) {
  const [days, setDays] = useState('30')
  const metrics = useApi<{ data: CustomerMetricsData }>(
    `/v1/customers/${encodeURIComponent(customerId)}/metrics?days=${days}`,
  )
  const d = metrics.data?.data
  return (
    <section
      className="mb-6 space-y-5"
      aria-label="Métricas del customer"
      aria-busy={metrics.isFetching}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">Actividad</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">UTC</span>
          <NativeSelect
            aria-label="Período de métricas"
            value={days}
            onChange={(event) => setDays(event.target.value)}
          >
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
          </NativeSelect>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Actualizar métricas"
            disabled={metrics.isFetching}
            onClick={() => void metrics.refetch()}
          >
            <RefreshCw className={metrics.isFetching ? 'animate-spin' : ''} />
          </Button>
        </div>
      </div>
      <ErrorNotice error={metrics.error} />
      {metrics.isLoading && (
        <>
          <Loading variant="cards" />
          <Loading variant="chart" />
        </>
      )}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              ['Enviados', number(d.sent), 'Sin fallas de entrega'],
              ['Recibidos', number(d.received), 'Mensajes entrantes'],
              [
                'Fallidos',
                number(d.failed),
                d.outbound
                  ? `${rate(d.failed, d.outbound)} de los salientes`
                  : 'Sin salientes',
              ],
              [
                'Entregados',
                number(d.delivered),
                d.outbound
                  ? `${rate(d.delivered, d.outbound)} de los salientes`
                  : 'Sin salientes',
              ],
            ].map(([label, value, detail]) => (
              <div key={label} className="rounded-lg border bg-card p-4">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="my-2 text-2xl font-semibold tracking-tight">{value}</p>
                <p className="text-xs text-muted-foreground">{detail}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            <span>
              Leídos <strong className="ml-1 text-foreground">{number(d.read)}</strong>
            </span>
            <span>
              Pendientes{' '}
              <strong className="ml-1 text-foreground">{number(d.pending)}</strong>
            </span>
            <span>
              Conexiones activas{' '}
              <strong className="ml-1 text-foreground">
                {d.connected} / {d.connections}
              </strong>
            </span>
            <span>
              Chats totales{' '}
              <strong className="ml-1 text-foreground">{number(d.conversations)}</strong>
            </span>
            <span>
              Chats abiertos{' '}
              <strong className="ml-1 text-foreground">
                {number(d.open_conversations)}
              </strong>
            </span>
          </div>
          <Suspense fallback={<Loading variant="chart" />}>
            <CustomerCharts data={d} />
          </Suspense>
          <p className="text-xs text-muted-foreground">
            Mensajes registrados en este proyecto. Los estados se actualizan con los
            webhooks de Meta.
          </p>
        </>
      )}
    </section>
  )
}

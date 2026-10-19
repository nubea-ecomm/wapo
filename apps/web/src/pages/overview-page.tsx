import { permissions } from '../app/permissions'
import { Skeleton } from '../components/ui/skeleton'
import { WhatsAppIcon } from '../components/icons/whatsapp-icon'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import type { Page, Connection, ProjectEvent } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useApi } from '../hooks/use-api'
import { PageHeader, Panel, Status, Empty, ErrorNotice, Loading } from '../components/ui'
import { lazy, Suspense } from 'react'
import type { ActivityPoint } from '../components/activity-chart'
const ActivityChart = lazy(() =>
  import('../components/activity-chart').then((module) => ({
    default: module.ActivityChart,
  })),
)
import { dateLabel } from '../lib/message-format'
interface Overview {
  customers: number
  connections: number
  conversations: number
  sent: number
  received: number
  delivered: number
  read: number
  failed: number
  series: ActivityPoint[]
}
export function OverviewPage() {
  const { session } = useSession()
  const billing = permissions(session).role === 'billing'
  const overview = useApi<{ data: Overview }>('/v1/overview')
  const connections = useApi<Page<Connection>>('/v1/connections', { enabled: !billing })
  const events = useApi<Page<ProjectEvent>>('/v1/events', { enabled: !billing })
  const d = overview.data?.data
  const stats = [
    { label: 'Enviados', value: d?.sent, detail: 'Últimos 30 días' },
    { label: 'Recibidos', value: d?.received, detail: 'Últimos 30 días' },
    {
      label: 'Entregados',
      value: d?.sent ? `${((d.delivered / d.sent) * 100).toFixed(1)}%` : '-',
      detail: `${d?.delivered || 0} mensajes`,
    },
    {
      label: 'Leídos',
      value: d?.sent ? `${((d.read / d.sent) * 100).toFixed(1)}%` : '-',
      detail: `${d?.read || 0} mensajes`,
    },
  ]
  return (
    <>
      <PageHeader
        title="Vista general"
        description="Resumen de mensajes."
        action={
          <Button asChild>
            <Link to="/connections">
              <WhatsAppIcon />
              Conectar WhatsApp <ArrowUpRight size={15} />
            </Link>
          </Button>
        }
      />
      <ErrorNotice error={overview.error || connections.error} />
      {!session?.tenantId && (
        <Panel>
          <Empty title="Elegí o creá un proyecto">
            <Link className="text-link" to="/tenants">
              Administrar proyectos →
            </Link>
          </Empty>
        </Panel>
      )}
      <div className="section-caption">
        <span>Mensajes</span>
        <Badge variant="outline">Últimos 30 días / UTC</Badge>
      </div>
      <section className="overview-metrics">
        <div className="stats-grid">
          {stats.map((s) => (
            <div className="stat-card" key={s.label}>
              <div>{s.label}</div>
              <strong>
                {overview.isLoading ? (
                  <Skeleton className="my-1 h-8 w-16" />
                ) : (
                  (s.value ?? '-')
                )}
              </strong>
              <small>{s.detail}</small>
            </div>
          ))}
        </div>
        <div className="chart-section">
          <h2>Mensajes por día</h2>
          <p className="muted">Volumen de mensajes enviados y recibidos.</p>
          {overview.isLoading ? (
            <Loading variant="chart" />
          ) : (
            <Suspense fallback={<Loading variant="chart" />}>
              <ActivityChart series={d?.series || []} />
            </Suspense>
          )}
        </div>
      </section>
      {!billing && (
        <div className="overview-grid">
          <Panel
            title="Conexiones"
            action={
              <Link className="text-link" to="/connections">
                Ver todos ↗
              </Link>
            }
          >
            {connections.isLoading ? (
              <Loading />
            ) : connections.error ? null : connections.data?.data.length ? (
              connections.data.data
                .filter((c) => c.channel === 'whatsapp')
                .slice(0, 5)
                .map((c) => (
                  <div className="list-row" key={c.id}>
                    <span className={`channel-avatar ${c.channel}`}>
                      <WhatsAppIcon size={18} />
                    </span>
                    <div className="grow">
                      <b>{c.name || c.display_phone_number || c.channel}</b>
                      <small>{`WhatsApp / ${c.connection_type || 'Cloud API'}`}</small>
                    </div>
                    <Status value={c.status} />
                  </div>
                ))
            ) : (
              <Empty title="Sin conexiones de WhatsApp" icon={<WhatsAppIcon size={28} />}>
                Conectá tu número de WhatsApp para empezar.
              </Empty>
            )}
          </Panel>
          <Panel
            title="Actividad reciente"
            action={
              <Link className="text-link" to="/events">
                Ver todos ↗
              </Link>
            }
          >
            {events.isLoading ? (
              <Loading />
            ) : events.error ? (
              <ErrorNotice error={events.error} />
            ) : events.data?.data.length ? (
              events.data.data.slice(0, 5).map((e) => (
                <div className="list-row" key={e.id}>
                  <span className="event-dot" />
                  <div className="grow">
                    <b>{e.event}</b>
                    <small>{dateLabel(e.created_at)}</small>
                  </div>
                </div>
              ))
            ) : (
              <Empty title="Sin eventos todavía">
                Los eventos aparecerán en esta lista.
              </Empty>
            )}
          </Panel>
        </div>
      )}
    </>
  )
}

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
import {
  PageHeader,
  Panel,
  Status,
  Empty,
  ErrorNotice,
  Loading,
} from '../components/ui'
import { lazy, Suspense } from 'react'
import type { ActivityPoint } from '../components/activity-chart'

const ActivityChart = lazy(() =>
  import('../components/activity-chart').then((module) => ({
    default: module.ActivityChart,
  })),
)

import { dateLabel } from '../lib/message-format'
import { useI18n } from '../app/i18n'

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
  const { t } = useI18n()
  const billing = permissions(session).role === 'billing'
  const overview = useApi<{ data: Overview }>('/v1/overview')
  const connections = useApi<Page<Connection>>('/v1/connections', {
    enabled: !billing,
  })
  const events = useApi<Page<ProjectEvent>>('/v1/events', { enabled: !billing })
  const d = overview.data?.data
  const stats = [
    {
      label: t('overview.sent'),
      value: d?.sent,
      detail: t('overview.last30Days'),
    },
    {
      label: t('overview.received'),
      value: d?.received,
      detail: t('overview.last30Days'),
    },
    {
      label: t('overview.delivered'),
      value: d?.sent ? `${((d.delivered / d.sent) * 100).toFixed(1)}%` : '-',
      detail: `${d?.delivered || 0} ${t('overview.messagesCount')}`,
    },
    {
      label: t('overview.read'),
      value: d?.sent ? `${((d.read / d.sent) * 100).toFixed(1)}%` : '-',
      detail: `${d?.read || 0} ${t('overview.messagesCount')}`,
    },
  ]

  return (
    <>
      <PageHeader
        title={t('overview')}
        description={t('overview.description')}
        action={
          <Button asChild>
            <Link to="/connections">
              <WhatsAppIcon />
              {t('overview.connectWhatsApp')} <ArrowUpRight size={15} />
            </Link>
          </Button>
        }
      />
      <ErrorNotice error={overview.error || connections.error} />
      {!session?.tenantId && (
        <Panel>
          <Empty title={t('overview.chooseProject')}>
            <Link
              className="text-link"
              to="/tenants"
            >
              {t('overview.manageProjects')} →
            </Link>
          </Empty>
        </Panel>
      )}
      <div className="section-caption">
        <span>{t('overview.messages')}</span>
        <Badge variant="outline">{t('overview.last30Days')} / UTC</Badge>
      </div>
      <section className="overview-metrics">
        <div className="stats-grid">
          {stats.map((s) => (
            <div
              className="stat-card"
              key={s.label}
            >
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
          <h2>{t('overview.messagesByDay')}</h2>
          <p className="muted">{t('overview.volumeDescription')}</p>
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
            title={t('overview.connections')}
            action={
              <Link
                className="text-link"
                to="/connections"
              >
                {t('common.viewAll')} ↗
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
                  <div
                    className="list-row"
                    key={c.id}
                  >
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
              <Empty
                title={t('overview.noConnections')}
                icon={<WhatsAppIcon size={28} />}
              >
                {t('overview.noConnectionsDescription')}
              </Empty>
            )}
          </Panel>
          <Panel
            title={t('overview.recentActivity')}
            action={
              <Link
                className="text-link"
                to="/events"
              >
                {t('common.viewAll')} ↗
              </Link>
            }
          >
            {events.isLoading ? (
              <Loading />
            ) : events.error ? (
              <ErrorNotice error={events.error} />
            ) : events.data?.data.length ? (
              events.data.data.slice(0, 5).map((e) => (
                <div
                  className="list-row"
                  key={e.id}
                >
                  <span className="event-dot" />
                  <div className="grow">
                    <b>{e.event}</b>
                    <small>{dateLabel(e.created_at)}</small>
                  </div>
                </div>
              ))
            ) : (
              <Empty title={t('overview.noEvents')}>
                {t('overview.noEventsDescription')}
              </Empty>
            )}
          </Panel>
        </div>
      )}
    </>
  )
}

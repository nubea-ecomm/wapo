import { ConnectionHealth } from '../components/connection-health'
import { CustomerMetrics } from '../components/customer-metrics'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useState } from 'react'
import type { Connection, Customer } from '@wapo/sdk'
import { ArrowLeft, MessagesSquare } from 'lucide-react'
import { useApi } from '../hooks/use-api'
import { usePaged } from '../hooks/use-paged'
import {
  PageHeader,
  Panel,
  Loading,
  Empty,
  ErrorNotice,
  Status,
  LoadMore,
} from '../components/ui'
import { Button } from '../components/ui/button'
import { NativeSelect } from '../components/ui/native-select'
import { WhatsAppIcon } from '../components/icons/whatsapp-icon'
import { TemplateList } from '../components/template-list'
export function EntityDetailPage({
  kind,
}: {
  kind: 'customers' | 'connections'
}) {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const entity = useApi<{ data: Customer & Connection }>(
    `/v1/${kind}/${encodeURIComponent(id)}`,
  )
  const related = usePaged<Connection>(
    kind === 'customers'
      ? `/v1/connections?customer_id=${encodeURIComponent(id)}`
      : '/v1/connections',
  )
  const [chosen, setChosen] = useState('')
  const current = entity.data?.data
  const connections =
    kind === 'connections' && current ? [current] : related.items
  const accounts = [
    ...new Map(
      connections
        .filter(
          (connection) =>
            connection.channel === 'whatsapp' && connection.business_account_id,
        )
        .map((connection) => [connection.business_account_id, connection]),
    ).values(),
  ]
  const selected =
    accounts.find((connection) => connection.id === chosen) || accounts[0]
  const tab = params.get('tab') || 'overview'
  const tabs =
    kind === 'customers'
      ? [
          ['overview', 'Resumen'],
          ['connections', 'Conexiones'],
          ['templates', 'Templates'],
        ]
      : [
          ['overview', 'Resumen'],
          ['health', 'Diagnóstico'],
          ['templates', 'Templates'],
        ]
  return (
    <>
      <Link
        to={`/${kind}`}
        className="mb-5 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        {kind === 'customers' ? 'Customers' : 'Conexiones'}
      </Link>
      <PageHeader
        title={
          current?.name || (kind === 'customers' ? 'Customer' : 'Conexión')
        }
        description={
          kind === 'customers'
            ? 'Datos y cuentas del negocio.'
            : 'Cuenta de WhatsApp.'
        }
      />
      <ErrorNotice error={entity.error} />
      {entity.isLoading && <Loading variant="settings" />}
      {current && (
        <>
          <div
            className="mb-6 flex gap-1 border-b pb-2"
            role="tablist"
            aria-label="Detalle"
          >
            {tabs.map(([value, label]) => (
              <Button
                key={value}
                role="tab"
                aria-selected={tab === value}
                variant={tab === value ? 'secondary' : 'ghost'}
                onClick={() => setParams({ tab: value })}
              >
                {label}
              </Button>
            ))}
          </div>
          {tab === 'overview' && (
            <>
              {kind === 'customers' && <CustomerMetrics customerId={id} />}
              <Panel title="Datos">
                <dl className="grid grid-cols-[120px_1fr] gap-4 text-sm">
                  <dt className="text-muted-foreground">Nombre</dt>
                  <dd>{current.name}</dd>
                  {kind === 'customers' ? (
                    <>
                      <dt className="text-muted-foreground">Email</dt>
                      <dd>{current.email || '-'}</dd>
                      <dt className="text-muted-foreground">ID externo</dt>
                      <dd>{current.external_customer_id || '-'}</dd>
                    </>
                  ) : (
                    <>
                      <dt className="text-muted-foreground">Número</dt>
                      <dd>{current.display_phone_number || '-'}</dd>
                      <dt className="text-muted-foreground">Estado</dt>
                      <dd>
                        <Status value={current.status} />
                      </dd>
                      <dt className="text-muted-foreground">Cuenta Meta</dt>
                      <dd className="font-mono text-xs">
                        {current.business_account_id || '-'}
                      </dd>
                    </>
                  )}
                </dl>
                {kind === 'connections' && (
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                    className="mt-5"
                  >
                    <Link to={`/inbox?connection=${encodeURIComponent(id)}`}>
                      <MessagesSquare />
                      Ver chats
                    </Link>
                  </Button>
                )}
              </Panel>
            </>
          )}
          {kind === 'connections' && tab === 'health' && (
            <ConnectionHealth
              id={id}
              customerId={current.customer_id}
              phoneNumberId={current.external_id}
            />
          )}
          {tab === 'connections' && (
            <Panel title="Conexiones">
              <ErrorNotice error={related.error} />
              {related.isLoading && <Loading />}
              {connections.map((connection) => (
                <div
                  className="flex items-center gap-3 border-b py-4 last:border-0"
                  key={connection.id}
                >
                  <WhatsAppIcon />
                  <Link
                    to={`/connections/${encodeURIComponent(connection.id)}`}
                    className="flex-1 text-sm font-medium hover:underline"
                  >
                    {connection.name ||
                      connection.display_phone_number ||
                      'WhatsApp'}
                  </Link>
                  <Status value={connection.status} />
                  <Button
                    variant="outline"
                    size="sm"
                    asChild
                  >
                    <Link
                      to={`/connections/${encodeURIComponent(connection.id)}?tab=templates`}
                    >
                      Templates
                    </Link>
                  </Button>
                </div>
              ))}
              {!related.isLoading && !related.error && !connections.length && (
                <Empty title="Sin conexiones" />
              )}
              <LoadMore
                available={related.hasNextPage}
                busy={related.isFetchingNextPage}
                load={() => void related.fetchNextPage()}
              />
            </Panel>
          )}
          {tab === 'templates' && (
            <>
              <ErrorNotice error={related.error} />
              {kind === 'customers' && related.isLoading && (
                <Loading variant="table" />
              )}
              {selected && (
                <>
                  {accounts.length > 1 && (
                    <div className="mb-5 max-w-sm">
                      <NativeSelect
                        aria-label="Cuenta de templates"
                        value={selected.id}
                        onChange={(event) => setChosen(event.target.value)}
                      >
                        {accounts.map((connection) => (
                          <option
                            key={connection.id}
                            value={connection.id}
                          >
                            {connection.name ||
                              connection.display_phone_number ||
                              'WhatsApp'}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  )}
                  <TemplateList
                    key={selected.id}
                    connection={selected}
                    connectionId={selected.id}
                    customerId={kind === 'customers' ? id : undefined}
                  />
                </>
              )}
              {!related.isLoading && !related.error && !selected && (
                <Empty title="Sin cuentas de WhatsApp">
                  Conectá un número para administrar sus templates.
                </Empty>
              )}
              {kind === 'customers' && (
                <LoadMore
                  available={related.hasNextPage}
                  busy={related.isFetchingNextPage}
                  load={() => void related.fetchNextPage()}
                />
              )}
            </>
          )}
        </>
      )}
    </>
  )
}

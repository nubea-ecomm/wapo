import { WhatsAppIcon } from '../components/icons/whatsapp-icon'
import { Button } from '../components/ui/button'
import { usePaged } from '../hooks/use-paged'
import { LoadMore } from '../components/ui'
import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Connection, Page, Customer } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useApi, useAction } from '../hooks/use-api'
import {
  PageHeader,
  Panel,
  ErrorNotice,
  Status,
  Empty,
  Loading,
  ConfirmButton,
} from '../components/ui'
import { ConnectionEditor } from '../components/connection-editor'
export function ConnectionsPage() {
  const { client, session } = useSession()
  const [create, setCreate] = useState(false)
  const connections = usePaged<Connection>('/v1/connections')
  const customers = useApi<Page<Customer>>('/v1/customers')
  const remove = useAction((id: string) => client.deleteConnection(id))
  return (
    <>
      <PageHeader
        title="Conexiones"
        description="Números de WhatsApp conectados."
        action={
          <Button
            variant="default"
            size="default"

            disabled={!session?.tenantId}
            onClick={() => setCreate(true)}
          >
            <WhatsAppIcon size={16} /> Conectar WhatsApp
          </Button>
        }
      />
      <ErrorNotice error={connections.error || remove.error} />
      {connections.isLoading && <Loading variant="cards" />}
      <div className="connection-grid">
        {connections.items
          .filter((c) => c.channel === 'whatsapp')
          .map((c) => (
            <article className="connection-card" key={c.id}>
              <div className="tenant-card-heading">
                <span className={`channel-avatar ${c.channel}`}>
                  <WhatsAppIcon size={23} />
                </span>
                <Status value={c.status} />
              </div>
              {(c.health_status === 'error' || c.health_status === 'warning') && (
                <Link
                  to={`/connections/${encodeURIComponent(c.id)}?tab=health`}
                  className="mb-3 block rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                >
                  {c.health_issues || 1}{' '}
                  {c.health_issues === 1 ? 'problema detectado' : 'problemas detectados'}.
                  Ver diagnóstico →
                </Link>
              )}
              <h3>
                <Link
                  className="hover:underline"
                  to={`/connections/${encodeURIComponent(c.id)}`}
                >
                  {c.name || c.display_phone_number || c.channel}
                </Link>
              </h3>
              <p>{`WhatsApp / ${c.connection_type || 'Cloud API'}`}</p>
              <dl>
                <dt>Customer</dt>
                <dd>
                  {customers.data?.data.find((x) => x.id === c.customer_id)?.name ||
                    'Proyecto'}
                </dd>
                {c.external_id && (
                  <>
                    <dt>Meta Phone ID</dt>
                    <dd>{c.external_id}</dd>
                  </>
                )}
                <dt>Conexión</dt>
                <dd className="mono">{c.id}</dd>
              </dl>
              <div className="row-actions">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/connections/${encodeURIComponent(c.id)}?tab=health`}>
                    Diagnóstico
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/connections/${encodeURIComponent(c.id)}?tab=templates`}>
                    Templates
                  </Link>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/inbox?connection=${encodeURIComponent(c.id)}`}>
                    <MessageCircle size={13} /> Ver chats
                  </Link>
                </Button>
                <ConfirmButton
                  disabled={remove.isPending}
                  message="¿Eliminar la conexión local? Esto no elimina el número ni la cuenta en Meta."
                  onConfirm={() => remove.mutateAsync(c.id)}
                >
                  Desconectar
                </ConfirmButton>
              </div>
            </article>
          ))}
      </div>
      {!connections.isLoading && !connections.error && connections.items.length === 0 && (
        <Panel>
          <Empty title="Sin conexiones" icon={<WhatsAppIcon size={28} />}>
            Registrá tu número de WhatsApp o generá un enlace de conexión desde Customers.
          </Empty>
        </Panel>
      )}
      <LoadMore
        available={connections.hasNextPage}
        busy={connections.isFetchingNextPage}
        load={() => {
          void connections.fetchNextPage()
        }}
      />
      {create && <ConnectionEditor onClose={() => setCreate(false)} />}
    </>
  )
}

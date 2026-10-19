import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Activity,
  FileText,
  LayoutGrid,
  List,
  MessageCircle,
  Pencil,
  Plus,
  Search,
} from 'lucide-react'
import type { Connection, Page, Customer } from '@wapo/sdk'
import { WhatsAppIcon } from '../components/icons/whatsapp-icon'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { usePaged } from '../hooks/use-paged'
import { useSession } from '../app/session-context'
import { permissions } from '../app/permissions'
import { useApi, useAction } from '../hooks/use-api'
import {
  PageHeader,
  Panel,
  ErrorNotice,
  Status,
  Empty,
  Loading,
  LoadMore,
} from '../components/ui'
import { ConnectionEditor } from '../components/connection-editor'
import { ConnectionUpdateEditor } from '../components/connection-update-editor'
import { ResourceActions } from '../components/resource-actions'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { useI18n } from '../app/i18n'

type ViewMode = 'cards' | 'table'

function savedView(): ViewMode {
  try {
    return localStorage.getItem('wapo.connections-view') === 'table'
      ? 'table'
      : 'cards'
  } catch {
    return 'cards'
  }
}

export function ConnectionsPage() {
  const { client, session } = useSession()
  const { t } = useI18n()
  const navigate = useNavigate()
  const [create, setCreate] = useState(false)
  const [editing, setEditing] = useState<Connection | null>(null)
  const [view, setView] = useState<ViewMode>(savedView)
  const [search, setSearch] = useState('')
  const connections = usePaged<Connection>('/v1/connections')
  const customers = useApi<Page<Customer>>('/v1/customers')
  const remove = useAction((id: string) => client.deleteConnection(id))
  const whatsapp = connections.items.filter(
    (connection) => connection.channel === 'whatsapp',
  )
  const customerNames = new Map(
    (customers.data?.data || []).map((customer) => [
      customer.id,
      customer.name,
    ]),
  )
  const filtered = whatsapp.filter((connection) => {
    const customer =
      customerNames.get(connection.customer_id || '') ||
      t('connections.project')

    return `${connection.name || ''} ${connection.display_phone_number || ''} ${connection.external_id || ''} ${connection.business_account_id || ''} ${customer}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  })

  function selectView(next: ViewMode) {
    setView(next)

    try {
      localStorage.setItem('wapo.connections-view', next)
    } catch {
      // The preference is optional in restricted browser contexts.
    }
  }

  function actions(connection: Connection) {
    const name =
      connection.name || connection.display_phone_number || 'WhatsApp'

    return (
      <ResourceActions
        name={name}
        actions={[
          {
            label: t('connections.edit'),
            icon: <Pencil />,
            onSelect: () => setEditing(connection),
          },
          {
            label: t('connections.diagnostics'),
            icon: <Activity />,
            onSelect: () =>
              navigate(
                `/connections/${encodeURIComponent(connection.id)}?tab=health`,
              ),
          },
          {
            label: 'Administrar templates',
            icon: <FileText />,
            onSelect: () =>
              navigate(
                `/connections/${encodeURIComponent(connection.id)}?tab=templates`,
              ),
          },
        ]}
        destructive={{
          label: 'Desconectar',
          description: t('connections.deleteDescription'),
          disabled: remove.isPending,
          onConfirm: () => remove.mutateAsync(connection.id),
        }}
      />
    )
  }

  return (
    <>
      <PageHeader
        title={t('connections')}
        description={t('connections.description')}
        action={
          <Button
            disabled={!session?.tenantId}
            onClick={() => setCreate(true)}
          >
            <Plus />
            {t('connections.connect')}
          </Button>
        }
      />
      <ErrorNotice
        error={connections.error || customers.error || remove.error}
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="hidden px-2 text-xs text-muted-foreground sm:inline">
            {whatsapp.length}{' '}
            {whatsapp.length === 1
              ? t('connections.singular')
              : t('connections.plural')}
          </span>
          <div className="search-input min-w-48 flex-1 sm:max-w-xs">
            <Search className="size-4" />
            <Input
              aria-label={t('connections.search')}
              placeholder={t('connections.searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <div
          className="flex rounded-md border p-0.5"
          role="group"
          aria-label="Vista de conexiones"
        >
          <Button
            type="button"
            size="icon-sm"
            variant={view === 'cards' ? 'secondary' : 'ghost'}
            aria-label={t('connections.cardView')}
            aria-pressed={view === 'cards'}
            onClick={() => selectView('cards')}
          >
            <LayoutGrid />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant={view === 'table' ? 'secondary' : 'ghost'}
            aria-label={t('connections.tableView')}
            aria-pressed={view === 'table'}
            onClick={() => selectView('table')}
          >
            <List />
          </Button>
        </div>
      </div>
      {connections.isLoading && (
        <Loading variant={view === 'cards' ? 'cards' : 'table'} />
      )}
      {!connections.isLoading && filtered.length > 0 && view === 'cards' && (
        <div className="connection-grid">
          {filtered.map((connection) => (
            <ConnectionCard
              key={connection.id}
              connection={connection}
              customer={
                customerNames.get(connection.customer_id || '') ||
                t('connections.project')
              }
              canWrite={permissions(session).canWrite}
              onEdit={() => setEditing(connection)}
              actions={actions(connection)}
            />
          ))}
        </div>
      )}
      {!connections.isLoading && filtered.length > 0 && view === 'table' && (
        <Panel
          title={t('connections.whatsapp')}
          className="resource-table"
        >
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('connections.connection')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>{t('connections.number')}</TableHead>
                  <TableHead>{t('connections.health')}</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((connection) => (
                  <TableRow key={connection.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="channel-avatar whatsapp size-9">
                          <WhatsAppIcon size={18} />
                        </span>
                        <div>
                          <Link
                            className="resource-name"
                            to={`/connections/${encodeURIComponent(connection.id)}`}
                          >
                            {connection.name ||
                              connection.display_phone_number ||
                              'WhatsApp'}
                          </Link>
                          <small>{connectionType(connection)}</small>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Status value={connection.status} />
                        {connection.credential_status === 'expired' && (
                          <Status value="credential_expired" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {customerNames.get(connection.customer_id || '') ||
                        t('connections.project')}
                    </TableCell>
                    <TableCell>
                      <span className="whitespace-nowrap">
                        {connection.display_phone_number ||
                          connection.external_id ||
                          '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <HealthStatus connection={connection} />
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          asChild
                        >
                          <Link
                            aria-label={`Ver chats de ${connection.name || 'WhatsApp'}`}
                            to={`/inbox?connection=${encodeURIComponent(connection.id)}`}
                          >
                            <MessageCircle />
                          </Link>
                        </Button>
                        {actions(connection)}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}
      {!connections.isLoading && !connections.error && !filtered.length && (
        <Panel>
          <Empty
            title={search ? t('noResults') : t('connections.none')}
            icon={<WhatsAppIcon size={28} />}
          >
            {search
              ? t('connections.noResultsDescription')
              : t('connections.noneDescription')}
          </Empty>
        </Panel>
      )}
      <LoadMore
        available={connections.hasNextPage}
        busy={connections.isFetchingNextPage}
        load={() => void connections.fetchNextPage()}
      />
      {create && <ConnectionEditor onClose={() => setCreate(false)} />}
      {editing && (
        <ConnectionUpdateEditor
          connection={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

function ConnectionCard({
  connection,
  customer,
  canWrite,
  onEdit,
  actions,
}: {
  connection: Connection
  customer: string
  canWrite: boolean
  onEdit: () => void
  actions: ReactNode
}) {
  const { t } = useI18n()
  const title = connection.name || connection.display_phone_number || 'WhatsApp'

  return (
    <article className="connection-card">
      <div className="connection-card-header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="channel-avatar whatsapp size-10">
            <WhatsAppIcon size={21} />
          </span>
          <div className="min-w-0">
            <Link
              className="block truncate text-sm font-semibold hover:underline"
              to={`/connections/${encodeURIComponent(connection.id)}`}
            >
              {title}
            </Link>
            <p className="mt-0.5 truncate">{connectionType(connection)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Status value={connection.status} />
          {actions}
        </div>
      </div>
      <div className="connection-card-body">
        {connection.credential_status === 'expired' && (
          <Link
            className="connection-alert danger"
            to={`/connections/${encodeURIComponent(connection.id)}?tab=health`}
          >
            <span>{t('connections.tokenExpired')}</span>
            <span>Renovar →</span>
          </Link>
        )}
        {connection.credential_status !== 'expired' &&
          (connection.health_status === 'error' ||
            connection.health_status === 'warning') && (
            <Link
              className={`connection-alert ${connection.health_status === 'error' ? 'danger' : 'warning'}`}
              to={`/connections/${encodeURIComponent(connection.id)}?tab=health`}
            >
              <span>
                {connection.health_issues || 1}{' '}
                {connection.health_issues === 1
                  ? 'problema detectado'
                  : 'problemas detectados'}
              </span>
              <span>Revisar →</span>
            </Link>
          )}
        <div className="connection-summary">
          <div>
            <span>Customer</span>
            <strong title={customer}>{customer}</strong>
          </div>
          <div>
            <span>{t('connections.number')}</span>
            <strong>
              {connection.display_phone_number ||
                connection.external_id ||
                t('connections.noNumber')}
            </strong>
          </div>
        </div>
        <div className="connection-identifiers">
          <div>
            <span>Phone ID</span>
            <code title={connection.external_id}>
              {compactID(connection.external_id || '—')}
            </code>
          </div>
          <div>
            <span>{t('connections.connection')}</span>
            <code title={connection.id}>{compactID(connection.id)}</code>
          </div>
        </div>
      </div>
      <div className="connection-card-footer">
        <Button
          variant="outline"
          size="sm"
          asChild
        >
          <Link to={`/connections/${encodeURIComponent(connection.id)}`}>
            Ver detalle
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          asChild
        >
          <Link to={`/inbox?connection=${encodeURIComponent(connection.id)}`}>
            <MessageCircle />
            Chats
          </Link>
        </Button>
        {canWrite && (
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
          >
            <Pencil />
            {t('connections.editAction')}
          </Button>
        )}
      </div>
    </article>
  )
}

function HealthStatus({ connection }: { connection: Connection }) {
  const { t } = useI18n()

  if (connection.credential_status === 'expired')
    return <Status value="credential_expired" />

  if (connection.health_status)
    return <Status value={connection.health_status} />

  return (
    <span className="text-xs text-muted-foreground">
      {t('common.notChecked')}
    </span>
  )
}

function connectionType(connection: Connection) {
  return connection.connection_type === 'coexistence'
    ? 'WhatsApp Business + API'
    : 'Cloud API dedicada'
}

function compactID(id: string) {
  return id.length > 20 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id
}

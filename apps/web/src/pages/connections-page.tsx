import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  FileText,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Search,
} from 'lucide-react'
import type { Connection, Customer, Page } from '@wapo/sdk'
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
  Empty,
  Loading,
  LoadMore,
} from '../components/ui'
import { ConnectionEditor } from '../components/connection-editor'
import { ConnectionUpdateEditor } from '../components/connection-update-editor'
import { ResourceActions } from '../components/resource-actions'
import { ConnectionCards } from '../components/connection-cards'
import { ConnectionsTable } from '../components/connections-table'
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
            label: t('connections.manageTemplates'),
            icon: <FileText />,
            onSelect: () =>
              navigate(
                `/connections/${encodeURIComponent(connection.id)}?tab=templates`,
              ),
          },
        ]}
        destructive={{
          label: t('connections.disconnect'),
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
          aria-label={t('connections.viewMode')}
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
        <ConnectionCards
          connections={filtered}
          customerNames={customerNames}
          canWrite={permissions(session).canWrite}
          onEdit={setEditing}
          actions={actions}
        />
      )}
      {!connections.isLoading && filtered.length > 0 && view === 'table' && (
        <ConnectionsTable
          connections={filtered}
          customerNames={customerNames}
          actions={actions}
        />
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

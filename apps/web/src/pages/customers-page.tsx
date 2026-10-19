import { useNavigate } from 'react-router-dom'
import { permissions } from '../app/permissions'
import { ResourceActions } from '../components/resource-actions'
import { WhatsAppIcon } from '../components/icons/whatsapp-icon'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'
import { usePaged } from '../hooks/use-paged'
import { LoadMore } from '../components/ui'
import { useState } from 'react'
import { Plus, Search, Pencil, Building2 } from 'lucide-react'
import type { Customer } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import {
  PageHeader,
  Panel,
  Empty,
  ErrorNotice,
  Loading,
} from '../components/ui'
import { CustomerEditor } from '../components/customer-editor'
import { CustomerOnboarding } from '../components/customer-onboarding'
import { useI18n } from '../app/i18n'

export function CustomersPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { client, session } = useSession()
  const [editor, setEditor] = useState<Customer | 'new' | null>(null)
  const [selected, setSelected] = useState<Customer | null>(null)
  const [search, setSearch] = useState('')
  const customers = usePaged<Customer>('/v1/customers')
  const remove = useAction(async (id: string) => {
    await client.deleteCustomer(id)

    if (selected?.id === id) setSelected(null)
  })
  const filtered =
    customers.items.filter((c) =>
      `${c.id} ${c.name} ${c.external_customer_id || ''} ${c.email || ''}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) || []

  return (
    <>
      <PageHeader
        title={t('customers')}
        description={t('customers.description')}
        action={
          <Button
            variant="default"
            size="default"

            disabled={!session?.tenantId}
            onClick={() => setEditor('new')}
          >
            <Plus size={16} /> {t('customers.new')}
          </Button>
        }
      />
      <Panel
        title={`${customers.items.length} ${customers.items.length === 1 ? 'customer' : 'customers'}`}
        className="resource-table"
        action={
          <div className="search-input">
            <Search size={15} />
            <Input
              aria-label={t('customers.search')}
              placeholder={t('customers.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      >
        <ErrorNotice error={customers.error || remove.error} />
        {customers.isLoading && <Loading variant="table" />}
        {filtered.length ? (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('customers')}</TableHead>
                  <TableHead>{t('customers.externalId')}</TableHead>
                  <TableHead>{t('customers.identifier')}</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="resource-avatar">
                          <Building2 className="size-4" />
                        </span>
                        <div>
                          <button
                            className="resource-name"
                            onClick={() =>
                              navigate(`/customers/${encodeURIComponent(c.id)}`)
                            }
                          >
                            {c.name}
                          </button>
                          <small>{c.email || t('customers.noEmail')}</small>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code>{c.external_customer_id || '-'}</code>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <code title={c.id}>
                        {c.id.slice(0, 12)}…{c.id.slice(-6)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!permissions(session).canWrite}
                          onClick={() => setSelected(c)}
                        >
                          <WhatsAppIcon />
                          {t('customers.connect')}
                        </Button>
                        <ResourceActions
                          name={c.name}
                          actions={[
                            {
                              label: 'Ver templates',
                              onSelect: () =>
                                navigate(
                                  `/customers/${encodeURIComponent(c.id)}?tab=templates`,
                                ),
                            },
                            {
                              label: t('customers.edit'),
                              icon: <Pencil />,
                              onSelect: () => setEditor(c),
                            },
                          ]}
                          destructive={{
                            label: t('customers.delete'),
                            description: `${t('customers.delete')}: ${c.name}. ${t('customers.deleteDescription')}`,
                            disabled: remove.isPending,
                            onConfirm: () => remove.mutateAsync(c.id),
                          }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          !customers.isLoading &&
          !customers.error && (
            <Empty title={search ? t('noResults') : t('customers.none')}>
              {t('customers.noneDescription')}
            </Empty>
          )
        )}
      </Panel>
      <LoadMore
        available={customers.hasNextPage}
        busy={customers.isFetchingNextPage}
        load={() => {
          void customers.fetchNextPage()
        }}
      />
      {selected && (
        <CustomerOnboarding
          key={selected.id}
          customer={selected}
          onClose={() => setSelected(null)}
        />
      )}
      {editor && (
        <CustomerEditor
          customer={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  )
}

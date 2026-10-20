import { useDeferredValue, useState } from 'react'
import type { Connection, Contact, Page } from '@nubea-ecomm/wapo-sdk'
import { Plus, Search, X } from 'lucide-react'
import { useAction, useApi } from '../hooks/use-api'
import { usePaged } from '../hooks/use-paged'
import { ContactEditor } from '../components/contact-editor'
import { ContactRow } from '../components/contact-row'
import {
  Empty,
  ErrorNotice,
  LoadMore,
  Loading,
  PageHeader,
} from '../components/ui'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { NativeSelect } from '../components/ui/native-select'
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table'
import { useSession } from '../app/session-context'
import { useI18n } from '../app/i18n'

export function ContactsPage() {
  const { client } = useSession()
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [connection, setConnection] = useState('')
  const [marketing, setMarketing] = useState('')
  const [editor, setEditor] = useState<Contact | 'new' | null>(null)
  const erase = useAction((id: string) => client.eraseContact(id))
  const query = new URLSearchParams()
  const deferredSearch = useDeferredValue(search)

  if (deferredSearch) query.set('search', deferredSearch)

  if (connection) query.set('connection_id', connection)

  if (marketing) query.set('marketing_status', marketing)

  const contacts = usePaged<Contact>(`/v1/contacts?${query.toString()}`)
  const connections = useApi<Page<Connection>>('/v1/connections')
  const whatsappConnections =
    connections.data?.data.filter((item) => item.channel === 'whatsapp') || []
  const filtered = Boolean(search || connection || marketing)

  return (
    <>
      <PageHeader
        title={t('contacts')}
        description={t('contacts.description')}
        action={
          <Button
            disabled={!whatsappConnections.length}
            onClick={() => setEditor('new')}
          >
            <Plus /> {t('contacts.new')}
          </Button>
        }
      />
      <ErrorNotice error={contacts.error || connections.error} />
      <div className="mb-5 rounded-lg border bg-muted/20 p-3">
        <div className="grid gap-2 md:grid-cols-[minmax(260px,460px)_minmax(200px,260px)_190px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              aria-label={t('contacts.search')}
              placeholder={t('contacts.searchPlaceholder')}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <NativeSelect
            aria-label={t('contacts.connectionFilter')}
            value={connection}
            onChange={(event) => setConnection(event.target.value)}
          >
            <option value="">{t('contacts.allConnections')}</option>
            {whatsappConnections.map((item) => (
              <option
                key={item.id}
                value={item.id}
              >
                {item.name || item.display_phone_number || item.id}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label={t('contacts.marketingFilter')}
            value={marketing}
            onChange={(event) => setMarketing(event.target.value)}
          >
            <option value="">{t('contacts.allMarketing')}</option>
            <option value="resumed">{t('contacts.marketingAllowed')}</option>
            <option value="stopped">{t('contacts.marketingStopped')}</option>
          </NativeSelect>
          <Button
            variant="ghost"
            size="sm"
            className={filtered ? '' : 'invisible'}
            onClick={() => {
              setSearch('')
              setConnection('')
              setMarketing('')
            }}
          >
            <X /> {t('contacts.clearFilters')}
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="pl-4">{t('contacts.identity')}</TableHead>
              <TableHead>{t('contacts.displayName')}</TableHead>
              <TableHead>{t('contacts.marketing')}</TableHead>
              <TableHead>{t('contacts.created')}</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contacts.items.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                erasePending={erase.isPending}
                edit={() => setEditor(contact)}
                erase={() => erase.mutateAsync(contact.id)}
              />
            ))}
          </TableBody>
        </Table>
        {contacts.isLoading && <Loading variant="table" />}
        {!contacts.isLoading && !contacts.items.length && (
          <Empty title={t('contacts.none')}>
            {t('contacts.noneDescription')}
          </Empty>
        )}
      </div>
      <LoadMore
        available={contacts.hasNextPage}
        busy={contacts.isFetchingNextPage}
        load={() => void contacts.fetchNextPage()}
      />
      {editor && (
        <ContactEditor
          contact={editor === 'new' ? undefined : editor}
          connections={whatsappConnections}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  )
}

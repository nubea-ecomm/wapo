import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { MessagesSquare, Plus, Search } from 'lucide-react'
import type { Connection, Conversation, Customer, Page } from '@wapo/sdk'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useSession } from '../app/session-context'
import { usePaged } from '../hooks/use-paged'
import { useApi } from '../hooks/use-api'
import { Empty, ErrorNotice, Loading } from '../components/ui'
import { ConversationThread } from '../components/conversation-thread'
import { NewChatDialog } from '../components/new-chat-dialog'
import { messageText, dateLabel } from '../lib/message-format'
import { FilterCombobox } from '../components/filter-combobox'

export function InboxPage() {
  const { session } = useSession()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('open')
  const [customer, setCustomer] = useState('')
  const [creating, setCreating] = useState(false)
  const connection = params.get('connection') || ''
  const selected = params.get('chat') || ''
  const query = new URLSearchParams()
  if (connection) query.set('connection_id', connection)
  if (customer) query.set('customer_id', customer)
  if (status) query.set('status', status)
  const chats = usePaged<Conversation>(
    `/v1/conversations${query.size ? `?${query}` : ''}`,
    true,
  )
  const connections = useApi<Page<Connection>>('/v1/connections')
  const customers = useApi<Page<Customer>>('/v1/customers')
  const availableConnections = (connections.data?.data || []).filter(
    (item) => !customer || item.customer_id === customer,
  )
  const filtered = chats.items.filter((conversation) =>
    `${conversation.contact} ${conversation.contact_name || ''} ${messageText(conversation.last_message)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  function select(id: string) {
    setParams({ ...(connection ? { connection } : {}), chat: id })
  }
  return (
    <div className={`inbox ${selected ? 'has-selection' : ''}`}>
      <section className="conversation-list" aria-label="Conversaciones">
        <div className="inbox-list-header">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h1>Inbox</h1>
              <span
                className="size-2 rounded-full bg-emerald-500"
                aria-label="En línea"
              />
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!session?.tenantId}
              onClick={() => setCreating(true)}
              aria-label="Nueva conversación"
            >
              <Plus />
            </Button>
          </div>
          <div className="search-input">
            <Search size={15} />
            <Input
              aria-label="Buscar conversaciones"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar conversaciones…"
            />
          </div>
          <div className="inbox-filters">
            <FilterCombobox
              label="Estado de conversaciones"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'open', label: 'Activas' },
                { value: 'closed', label: 'Cerradas' },
                { value: '', label: 'Todas' },
              ]}
            />
            <FilterCombobox
              label="Customer de conversaciones"
              value={customer}
              searchPlaceholder="Buscar customer…"
              onChange={(value) => {
                setCustomer(value)
                setParams({})
              }}
              options={[
                { value: '', label: 'Todos los customers' },
                ...(customers.data?.data || []).map((item) => ({
                  value: item.id,
                  label: item.name,
                  keywords: item.external_customer_id || '',
                })),
              ]}
            />
          </div>
          <FilterCombobox
            label="Conexión de conversaciones"
            value={connection}
            searchPlaceholder="Buscar conexión…"
            onChange={(value) => setParams(value ? { connection: value } : {})}
            options={[
              { value: '', label: 'Todas las conexiones' },
              ...availableConnections.map((item) => ({
                value: item.id,
                label: item.name || item.display_phone_number || item.id,
                keywords: `${item.display_phone_number || ''} ${item.external_id || ''}`,
              })),
            ]}
          />
        </div>
        <ErrorNotice error={chats.error || connections.error || customers.error} />
        <div className="conversation-results">
          {chats.isLoading && <Loading />}
          {filtered.map((conversation) => (
            <button
              className={`conversation-preview ${selected === conversation.id ? 'selected' : ''}`}
              key={conversation.id}
              onClick={() => select(conversation.id)}
            >
              <span className="contact-avatar">
                {(conversation.contact_name || conversation.contact)
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <div>
                <div>
                  <b>{conversation.contact_name || conversation.contact}</b>
                  <small>{dateLabel(conversation.updated_at)}</small>
                </div>
                <p>{messageText(conversation.last_message)}</p>
                <span className="conversation-meta">
                  {conversation.assigned_to || 'Sin asignar'}
                  {conversation.status === 'open' && <i aria-label="Activa" />}
                </span>
              </div>
            </button>
          ))}
          {!filtered.length && !chats.isLoading && !chats.error && (
            <Empty title="Todavía no hay chats">
              {search
                ? 'Probá con otra búsqueda.'
                : 'Iniciá una conversación con un template.'}
            </Empty>
          )}
          {chats.hasNextPage && (
            <Button
              variant="ghost"
              className="w-full"
              disabled={chats.isFetchingNextPage}
              onClick={() => void chats.fetchNextPage()}
            >
              {chats.isFetchingNextPage ? 'Cargando…' : 'Cargar más chats'}
            </Button>
          )}
        </div>
      </section>
      <section className="thread-panel">
        {selected ? (
          <ConversationThread
            key={selected}
            id={selected}
            onBack={() => setParams(connection ? { connection } : {})}
          />
        ) : (
          <div className="thread-empty">
            <MessagesSquare size={42} />
            <h2>Seleccioná una conversación</h2>
            <p>Elegí un chat de la lista para ver sus mensajes.</p>
          </div>
        )}
      </section>
      {creating && (
        <NewChatDialog onClose={() => setCreating(false)} onCreated={select} />
      )}
    </div>
  )
}

import { NativeSelect } from '../components/ui/native-select'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Search, MessagesSquare } from 'lucide-react'
import type { Conversation } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { usePaged } from '../hooks/use-paged'
import { PageHeader, Empty, ErrorNotice, Loading } from '../components/ui'
import { ConversationThread } from '../components/conversation-thread'
import { NewChatDialog } from '../components/new-chat-dialog'
import { messageText, dateLabel } from '../lib/message-format'
export function InboxPage() {
  const { session } = useSession()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [creating, setCreating] = useState(false)
  const connection = params.get('connection') || ''
  const selected = params.get('chat') || ''
  const query = new URLSearchParams()
  if (connection) query.set('connection_id', connection)
  if (status) query.set('status', status)
  const chats = usePaged<Conversation>(
    `/v1/conversations${query.size ? `?${query}` : ''}`,
    true,
  )
  const filtered = chats.items.filter((c) =>
    `${c.contact} ${c.contact_name || ''} ${messageText(c.last_message)}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  function select(id: string) {
    setParams({ ...(connection ? { connection } : {}), chat: id })
  }
  return (
    <>
      <PageHeader
        title="Chats"
        description="Conversaciones de WhatsApp."
        action={
          <Button
            variant="default"
            size="default"

            disabled={!session?.tenantId}
            onClick={() => setCreating(true)}
          >
            <Plus size={15} /> Nueva conversación
          </Button>
        }
      />
      <div className="inbox">
        <section className="conversation-list">
          <div className="inbox-tools">
            <div className="search-input">
              <Search size={15} />
              <Input
                aria-label="Buscar conversaciones"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar conversaciones…"
              />
            </div>
            <NativeSelect
              aria-label="Estado de conversaciones"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todos los chats</option>
              <option value="open">Abiertos</option>
              <option value="closed">Cerrados</option>
            </NativeSelect>
          </div>
          <ErrorNotice error={chats.error} />
          {chats.isLoading && <Loading />}
          {filtered.map((c) => (
            <button
              className={`conversation-preview ${selected === c.id ? 'selected' : ''}`}
              key={c.id}
              onClick={() => select(c.id)}
            >
              <span className="contact-avatar">
                {(c.contact_name || c.contact).slice(0, 1).toUpperCase()}
              </span>
              <div>
                <div>
                  <b>{c.contact_name || c.contact}</b>
                  <small>{dateLabel(c.updated_at)}</small>
                </div>
                <p>{messageText(c.last_message)}</p>
                <span>
                  {c.channel} / {c.status}
                  {c.assigned_to && ` / ${c.assigned_to}`}
                </span>
              </div>
            </button>
          ))}
          {!filtered.length && !chats.isLoading && !chats.error && (
            <Empty title="Todavía no hay chats">
              Enviá un mensaje o esperá una consulta por WhatsApp.
            </Empty>
          )}
          {chats.hasNextPage && (
            <Button
              variant="ghost"
              size="default"

              disabled={chats.isFetchingNextPage}
              onClick={() => {
                void chats.fetchNextPage()
              }}
            >
              {chats.isFetchingNextPage ? 'Cargando…' : 'Cargar más chats'}
            </Button>
          )}
        </section>
        <section className="thread-panel">
          {selected ? (
            <ConversationThread key={selected} id={selected} />
          ) : (
            <div className="thread-empty">
              <MessagesSquare size={48} />
              <h2>Seleccioná una conversación</h2>
              <p>Elegí un chat para ver los mensajes.</p>
            </div>
          )}
        </section>
      </div>
      {creating && (
        <NewChatDialog onClose={() => setCreating(false)} onCreated={select} />
      )}
    </>
  )
}

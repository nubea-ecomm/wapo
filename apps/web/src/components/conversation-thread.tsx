import { permissions } from '../app/permissions'
import { WhatsAppIcon } from './icons/whatsapp-icon'
import { Textarea } from '../components/ui/textarea'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useState } from 'react'
import type { Conversation, Message } from '@wapo/sdk'
import { Send, CheckCheck, CircleCheck, RotateCcw } from 'lucide-react'
import { useSession } from '../app/session-context'
import { useApi, useAction } from '../hooks/use-api'
import { usePaged } from '../hooks/use-paged'
import { ErrorNotice, Loading, Status } from './ui'
import { dateLabel, messageText } from '../lib/message-format'
export function ConversationThread({ id }: { id: string }) {
  const { client, session } = useSession()
  const readOnly = !permissions(session).canWrite
  const [text, setText] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const conversation = useApi<{ data: Conversation }>(
    `/v1/conversations/${encodeURIComponent(id)}`,
    { poll: true },
  )
  const messages = usePaged<Message>(
    `/v1/conversations/${encodeURIComponent(id)}/messages`,
    true,
  )
  const c = conversation.data?.data
  const reply = useAction(async () => {
    await client.reply(id, text, key)
    setText('')
    setKey(crypto.randomUUID())
  })
  const update = useAction(
    (input: { status?: 'open' | 'closed'; assigned_to?: string }) =>
      client.updateConversation(id, input),
  )
  const timeline = [...new Map(messages.items.map((m) => [m.id, m])).values()].reverse()
  if (conversation.isLoading) return <Loading variant="thread" />
  return (
    <div className="conversation-thread">
      <ErrorNotice error={conversation.error} />
      {c && (
        <>
          <header className="thread-header">
            <div>
              <b>{c.contact_name || c.contact}</b>
              <small className="flex items-center gap-1.5">
                <WhatsAppIcon size={12} />
                {c.contact} / WhatsApp
              </small>
            </div>
            <div className="row-actions">
              <Status value={c.status} />
              <Button
                variant="outline"
                size="sm"

                disabled={readOnly || update.isPending}
                onClick={() =>
                  update.mutate({ status: c.status === 'open' ? 'closed' : 'open' })
                }
              >
                {c.status === 'open' ? (
                  <CircleCheck size={14} />
                ) : (
                  <RotateCcw size={14} />
                )}{' '}
                {update.isPending
                  ? 'Guardando…'
                  : c.status === 'open'
                    ? 'Cerrar'
                    : 'Reabrir'}
              </Button>
            </div>
          </header>
          <div className="assignment-bar">
            <span>Responsable</span>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                update.mutate({ assigned_to: assignedTo ?? c.assigned_to })
              }}
            >
              <Input
                disabled={readOnly}
                aria-label="Responsable"
                placeholder="Sin asignar"
                value={assignedTo ?? c.assigned_to}
                onChange={(e) => setAssignedTo(e.target.value)}
                maxLength={120}
              />
              <Button
                variant="link"
                size="default"
                disabled={readOnly || update.isPending}
              >
                {update.isPending ? 'Guardando…' : 'Guardar'}
              </Button>
            </form>
          </div>
          <ErrorNotice error={update.error} />
          <div className="timeline">
            {messages.hasNextPage && (
              <Button
                variant="outline"
                size="sm"

                disabled={messages.isFetchingNextPage}
                onClick={() => {
                  void messages.fetchNextPage()
                }}
              >
                {messages.isFetchingNextPage ? 'Cargando…' : 'Cargar anteriores'}
              </Button>
            )}
            {messages.isLoading && <Loading />}
            <ErrorNotice error={messages.error} />
            {timeline.map((m) => (
              <article className={`message-bubble ${m.direction}`} key={m.id}>
                <p>{messageText(m)}</p>
                <small>
                  {dateLabel(m.timestamp)}{' '}
                  {m.direction === 'outbound' && (
                    <>
                      <CheckCheck size={12} /> {m.status}
                    </>
                  )}
                </small>
              </article>
            ))}
          </div>
          <form
            className="reply-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) reply.mutate()
            }}
          >
            <ErrorNotice error={reply.error} />
            <Textarea
              disabled={readOnly}
              aria-label="Responder conversación"
              placeholder="Escribí una respuesta…"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setKey(crypto.randomUUID())
              }}
              rows={2}
              required
            />
            <div>
              <small>Actualización automática cada 5 segundos</small>
              <Button
                variant="default"
                size="default"

                disabled={readOnly || reply.isPending || !text.trim()}
              >
                <Send size={15} /> {reply.isPending ? 'Enviando…' : 'Responder'}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}

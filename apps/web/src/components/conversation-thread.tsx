import { useState } from 'react'
import type { Connection, Conversation, Message } from '@nubea-ecomm/wapo-sdk'
import {
  ArrowLeft,
  CircleCheck,
  Clock,
  FileText,
  RotateCcw,
  Send,
  UserRound,
} from 'lucide-react'
import { permissions } from '../app/permissions'
import { Textarea } from './ui/textarea'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { useSession } from '../app/session-context'
import { useApi, useAction } from '../hooks/use-api'
import { usePaged } from '../hooks/use-paged'
import { ErrorNotice, Loading, Status } from './ui'
import { dateLabel } from '../lib/message-format'
import { MessageTimeline } from './message-timeline'
import { useConversationReply } from '../hooks/use-conversation-reply'
import { WhatsAppIcon } from './icons/whatsapp-icon'
import { TemplateSendDialog } from './template-send-dialog'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

export function ConversationThread({
  id,
  onBack,
}: {
  id: string
  onBack?: () => void
}) {
  const { client, session } = useSession()
  const readOnly = !permissions(session).canWrite
  const [text, setText] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [assignedTo, setAssignedTo] = useState<string | null>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const conversation = useApi<{ data: Conversation }>(
    `/v1/conversations/${encodeURIComponent(id)}`,
    { poll: 1500 },
  )
  const messages = usePaged<Message>(
    `/v1/conversations/${encodeURIComponent(id)}/messages`,
    1500,
  )
  const c = conversation.data?.data
  const connection = useApi<{ data: Connection }>(
    `/v1/connections/${encodeURIComponent(c?.connection_id || '')}`,
    { enabled: Boolean(c?.connection_id) },
  )
  const serviceWindowOpen = c?.service_window_open === true
  const reply = useConversationReply(id)
  const update = useAction(
    (input: { status?: 'open' | 'closed'; assigned_to?: string }) =>
      client.updateConversation(id, input),
  )
  const pending: Message | undefined =
    reply.isPending && reply.variables && c
      ? {
          id: `pending-${reply.variables.key}`,
          connection_id: c.connection_id,
          conversation_id: id,
          channel: c.channel,
          direction: 'outbound',
          status: 'pending',
          timestamp: new Date(reply.submittedAt).toISOString(),
          payload: { type: 'text', text: { body: reply.variables.text } },
        }
      : undefined

  if (conversation.isLoading) return <Loading variant="thread" />

  return (
    <div className="conversation-thread">
      <ErrorNotice error={conversation.error} />
      {c && (
        <>
          <header className="thread-header">
            <div className="flex min-w-0 items-center gap-3">
              {onBack && (
                <Button
                  className="thread-back"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onBack}
                  aria-label="Volver a conversaciones"
                >
                  <ArrowLeft />
                </Button>
              )}
              <span className="contact-avatar thread-contact-avatar">
                {(c.contact_name || c.contact).slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <b className="block truncate">{c.contact_name || c.contact}</b>
                <small className="flex items-center gap-1.5">
                  <WhatsAppIcon size={12} />
                  {c.contact} · WhatsApp
                </small>
              </div>
            </div>
            <div className="thread-actions">
              <Status
                value={serviceWindowOpen ? 'active' : 'expired'}
                label={serviceWindowOpen ? 'Ventana 24 h' : 'Requiere template'}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                  >
                    <UserRound /> {c.assigned_to || 'Sin asignar'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end">
                  <form
                    className="grid gap-3"
                    onSubmit={(event) => {
                      event.preventDefault()
                      update.mutate({
                        assigned_to: assignedTo ?? c.assigned_to,
                      })
                    }}
                  >
                    <label
                      className="text-xs font-medium"
                      htmlFor="conversation-assignee"
                    >
                      Responsable
                    </label>
                    <Input
                      id="conversation-assignee"
                      disabled={readOnly}
                      placeholder="Sin asignar"
                      value={assignedTo ?? c.assigned_to}
                      onChange={(event) => setAssignedTo(event.target.value)}
                      maxLength={120}
                    />
                    <Button
                      size="sm"
                      disabled={readOnly || update.isPending}
                    >
                      {update.isPending ? 'Guardando…' : 'Guardar responsable'}
                    </Button>
                  </form>
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="sm"
                disabled={readOnly || update.isPending}
                onClick={() =>
                  update.mutate({
                    status: c.status === 'open' ? 'closed' : 'open',
                  })
                }
              >
                {c.status === 'open' ? <CircleCheck /> : <RotateCcw />}
                {update.isPending
                  ? 'Guardando…'
                  : c.status === 'open'
                    ? 'Cerrar'
                    : 'Reabrir'}
              </Button>
            </div>
          </header>
          <ErrorNotice error={update.error} />
          <MessageTimeline
            messages={messages.items}
            pending={pending}
            loading={messages.isLoading}
            error={messages.error}
            hasMore={messages.hasNextPage}
            loadingMore={messages.isFetchingNextPage}
            loadMore={() => void messages.fetchNextPage()}
          />
          {serviceWindowOpen ? (
            <form
              className="reply-form"
              onSubmit={(event) => {
                event.preventDefault()

                if (text.trim() && !reply.isPending)
                  reply.mutate(
                    { text, key },
                    {
                      onSuccess: (_, submitted) => {
                        setText((current) =>
                          current === submitted.text ? '' : current,
                        )
                        setKey(crypto.randomUUID())
                      },
                    },
                  )
              }}
            >
              <ErrorNotice error={reply.error} />
              <Textarea
                disabled={readOnly}
                aria-label="Responder conversación"
                placeholder="Escribí un mensaje…"
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  setKey(crypto.randomUUID())
                }}
                rows={2}
                required
              />
              <div>
                <small className="flex items-center gap-1">
                  <Clock className="size-3" /> Ventana abierta hasta{' '}
                  {dateLabel(c.service_window_expires_at)}
                </small>
                <Button disabled={readOnly || reply.isPending || !text.trim()}>
                  <Send /> {reply.isPending ? 'Enviando…' : 'Enviar'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="reply-form closed-window-composer">
              <div>
                <strong>La ventana de 24 horas está cerrada</strong>
                <small>Retomá el contacto con un template aprobado.</small>
              </div>
              <Button
                disabled={readOnly || !connection.data?.data}
                onClick={() => setTemplateOpen(true)}
              >
                <FileText /> Enviar template
              </Button>
            </div>
          )}
          {templateOpen && connection.data?.data && (
            <TemplateSendDialog
              connection={connection.data.data}
              recipient={c.contact}
              title="Retomar conversación"
              onClose={() => setTemplateOpen(false)}
            />
          )}
        </>
      )}
    </div>
  )
}

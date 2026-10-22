import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Message, MessageReference } from '@nubea-ecomm/wapo-sdk'
import { Button } from './ui/button'
import { ErrorNotice } from './ui'
import { ChatLoader } from './chat-loader'
import { ChatMessage } from './chat-message'
import { chatDayKey, chatDayLabel, messageDate } from '../lib/chat-time'

export function MessageTimeline({
  messages,
  pending,
  loading,
  error,
  hasMore,
  loadingMore,
  loadMore,
  contactName = 'Contacto',
  conversationID,
  canInteract = false,
  onReply,
  onReact,
}: {
  messages: Message[]
  pending?: Message
  loading: boolean
  error: unknown
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
  contactName?: string
  conversationID?: string
  canInteract?: boolean
  onReply?: (message: Message) => void
  onReact?: (message: Message, emoji: string, key: string) => Promise<unknown>
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)

    return () => window.clearInterval(timer)
  }, [])
  const nearBottom = useRef(true)
  const activeSend = useRef('')
  const previous = useRef({ first: '', height: 0, top: 0 })

  useEffect(() => {
    const element = viewport.current

    if (!element || typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver(() => {
      if (nearBottom.current) element.scrollTop = element.scrollHeight

      previous.current.height = element.scrollHeight
      previous.current.top = element.scrollTop
    })

    observer.observe(element)

    if (content.current) observer.observe(content.current)

    return () => observer.disconnect()
  }, [loading])
  const unique = new Map<string, Message>()

  for (const message of messages) {
    if (message.payload.type !== 'reaction' && !unique.has(message.id))
      unique.set(message.id, message)
  }

  const timeline = [...unique.values()].reverse()

  if (pending && pending.payload.type !== 'reaction') timeline.push(pending)

  function jump(id: string) {
    const target = [
      ...(viewport.current?.querySelectorAll<HTMLElement>(
        '[data-message-id]',
      ) || []),
    ].find((element) => element.dataset.messageId === id)

    if (!target) return

    target.scrollIntoView({
      block: 'center',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
    target.classList.add('is-highlighted')
    window.setTimeout(() => target.classList.remove('is-highlighted'), 1500)
  }

  useLayoutEffect(() => {
    const element = viewport.current

    if (!element) return

    if (pending?.id && activeSend.current !== pending.id)
      nearBottom.current = true

    activeSend.current = pending?.id || ''

    const first = timeline[0]?.id || ''

    if (nearBottom.current) {
      element.scrollTop = element.scrollHeight
    } else if (previous.current.first && first !== previous.current.first) {
      // Preserve the visible position when older history is prepended.
      element.scrollTop =
        previous.current.top + element.scrollHeight - previous.current.height
    }

    previous.current = {
      first,
      height: element.scrollHeight,
      top: element.scrollTop,
    }
  })

  return (
    <div
      className="timeline"
      ref={viewport}
      onScroll={() => {
        const element = viewport.current

        if (!element) return

        nearBottom.current =
          element.scrollHeight - element.scrollTop - element.clientHeight < 80
        previous.current.top = element.scrollTop
      }}
    >
      {loading && !timeline.length ? (
        <ChatLoader
          label="Cargando mensajes"
          full
        />
      ) : (
        <div
          className="timeline-content"
          ref={content}
        >
          {hasMore && (
            <Button
              className="load-older"
              variant="outline"
              size="sm"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? 'Cargando…' : 'Cargar anteriores'}
            </Button>
          )}
          <ErrorNotice error={error} />
          {timeline.map((message, index) => {
            const previous = timeline[index - 1]
            const dayChanged =
              !previous ||
              chatDayKey(previous.timestamp) !== chatDayKey(message.timestamp)
            const time = messageDate(message.timestamp)?.getTime() || 0
            const priorTime = messageDate(previous?.timestamp)?.getTime() || 0
            const grouped =
              !dayChanged &&
              previous.direction === message.direction &&
              time >= priorTime &&
              time - priorTime < 300_000
            const context = message.payload.context as
              { id?: string; message_id?: string } | undefined
            const referenceID =
              message.reply_to?.message_id || context?.id || context?.message_id
            const parent = referenceID ? unique.get(referenceID) : undefined
            const reference: MessageReference | undefined =
              message.reply_to ||
              (referenceID
                ? {
                    message_id: referenceID,
                    unavailable: !parent,
                    direction: parent?.direction,
                    payload: parent?.payload,
                    display_text: parent?.display_text,
                  }
                : undefined)
            const available =
              canInteract &&
              !message.id.startsWith('pending-') &&
              !['pending', 'failed'].includes(message.status)

            return (
              <Fragment key={message.id}>
                {dayChanged && (
                  <div className="chat-day-divider">
                    <span>{chatDayLabel(message.timestamp)}</span>
                  </div>
                )}
                {index === 0 && !hasMore && conversationID && (
                  <div className="chat-conversation-divider">
                    <span>
                      Conversación{' '}
                      {conversationID.replace(/^conv_/, '').slice(-8)}
                    </span>
                  </div>
                )}
                <ChatMessage
                  message={message}
                  contactName={contactName}
                  grouped={grouped}
                  reference={reference}
                  onJump={
                    referenceID && parent ? () => jump(referenceID) : undefined
                  }
                  canReply={available && Boolean(onReply)}
                  canReact={
                    available &&
                    Boolean(onReact) &&
                    message.direction === 'inbound' &&
                    Boolean(time && now - time <= 30 * 86400_000)
                  }
                  onReply={() => onReply?.(message)}
                  onReact={(emoji, key) =>
                    onReact ? onReact(message, emoji, key) : Promise.resolve()
                  }
                />
              </Fragment>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useLayoutEffect, useRef } from 'react'
import type { Message } from '@nubea-ecomm/wapo-sdk'
import { Button } from './ui/button'
import { ErrorNotice, Loading } from './ui'
import { dateLabel } from '../lib/message-format'
import { MessageContent } from './message-content'
import { MessageDeliveryStatus } from './message-delivery-status'

export function MessageTimeline({
  messages,
  pending,
  loading,
  error,
  hasMore,
  loadingMore,
  loadMore,
}: {
  messages: Message[]
  pending?: Message
  loading: boolean
  error: unknown
  hasMore: boolean
  loadingMore: boolean
  loadMore: () => void
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const previous = useRef({ first: '', height: 0, top: 0 })
  const unique = new Map<string, Message>()

  for (const message of messages) {
    if (!unique.has(message.id)) unique.set(message.id, message)
  }

  const timeline = [...unique.values()].reverse()

  if (pending) timeline.push(pending)

  useLayoutEffect(() => {
    const element = viewport.current

    if (!element) return

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
      <div className="timeline-content">
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
        {loading && <Loading />}
        <ErrorNotice error={error} />
        {timeline.map((message) => (
          <article
            className={`message-bubble ${message.direction}`}
            key={message.id}
          >
            <MessageContent message={message} />
            <small>
              {dateLabel(message.timestamp)}{' '}
              {message.direction === 'outbound' && (
                <MessageDeliveryStatus status={message.status} />
              )}
            </small>
          </article>
        ))}
      </div>
    </div>
  )
}

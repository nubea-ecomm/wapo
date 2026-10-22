import type { Message, MessageReference } from '@nubea-ecomm/wapo-sdk'
import { contactInitials, messageTime } from '../lib/chat-time'
import { dateLabel } from '../lib/message-format'
import { MessageContent } from './message-content'
import { MessageDeliveryStatus } from './message-delivery-status'
import { MessageActions } from './message-actions'
import { MessageQuote } from './message-quote'

export function ChatMessage({
  message,
  contactName,
  grouped,
  canReply,
  canReact,
  reference,
  onReply,
  onReact,
  onJump,
}: {
  message: Message
  contactName: string
  grouped: boolean
  canReply: boolean
  canReact: boolean
  reference?: MessageReference
  onReply: () => void
  onReact: (emoji: string, key: string) => Promise<unknown>
  onJump?: () => void
}) {
  const reactions = new Map<
    string,
    { count: number; actors: string[]; own: boolean }
  >()

  for (const reaction of message.reactions || []) {
    const item = reactions.get(reaction.emoji) || {
      count: 0,
      actors: [],
      own: false,
    }

    item.count++
    item.actors.push(reaction.direction === 'outbound' ? 'Vos' : contactName)
    item.own ||= reaction.direction === 'outbound'
    reactions.set(reaction.emoji, item)
  }

  return (
    <article
      className={`message-row ${message.direction}${grouped ? ' is-grouped' : ''}`}
      data-message-id={message.id}
    >
      {message.direction === 'inbound' && (
        <span
          className={`participant-avatar${grouped ? ' is-placeholder' : ''}`}
          aria-hidden="true"
        >
          {contactInitials(contactName)}
        </span>
      )}
      <div className="message-body">
        <div className={`message-bubble ${message.direction}`}>
          {reference && (
            <MessageQuote
              reference={reference}
              contactName={contactName}
              onJump={onJump}
            />
          )}
          <MessageContent message={message} />
          <small className="message-meta">
            <time title={dateLabel(message.timestamp)}>
              {messageTime(message.timestamp)}
            </time>
            {message.direction === 'outbound' && (
              <MessageDeliveryStatus status={message.status} />
            )}
          </small>
        </div>
        {reactions.size > 0 && (
          <div
            className="message-reactions"
            aria-label="Reacciones"
          >
            {[...reactions].map(([emoji, item]) => (
              <span
                key={emoji}
                className={item.own ? 'reaction-chip is-own' : 'reaction-chip'}
                title={item.actors.join(', ')}
                aria-label={`${emoji}: ${item.actors.join(', ')}`}
              >
                {emoji}
                {item.count > 1 && <b>{item.count}</b>}
              </span>
            ))}
          </div>
        )}
        {canReply && (
          <MessageActions
            message={message}
            canReply={canReply}
            canReact={canReact}
            onReply={onReply}
            onReact={onReact}
          />
        )}
      </div>
    </article>
  )
}

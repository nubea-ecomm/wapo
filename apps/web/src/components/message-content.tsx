import type { Message } from '@nubea-ecomm/wapo-sdk'
import { ExternalLink, List, UserRound } from 'lucide-react'
import { messageText } from '../lib/message-format'
import { MessageMedia } from './message-media'
import { WhatsAppText } from './whatsapp-text'

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

export function MessageContent({ message }: { message: Message }) {
  const type = message.payload.type

  if (
    typeof type === 'string' &&
    ['image', 'audio', 'video', 'document', 'sticker'].includes(type)
  )
    return <MessageMedia message={message} />

  if (type === 'contacts' && Array.isArray(message.payload.contacts))
    return (
      <>
        {message.payload.contacts.map((contact, index) => {
          const data = object(contact),
            name = object(data.name)

          return (
            <div
              className="message-contact"
              key={index}
            >
              <UserRound size={20} />
              <div>
                <strong>
                  {String(name.formatted_name || name.first_name || 'Contacto')}
                </strong>
                {Array.isArray(data.phones) &&
                  data.phones.map((phone, i) => (
                    <p key={i}>{String(object(phone).phone || '')}</p>
                  ))}
              </div>
            </div>
          )
        })}
      </>
    )

  const interactive = object(message.payload.interactive)
  const body = object(interactive.body)

  if (type === 'interactive' && typeof body.text === 'string') {
    const header = object(interactive.header),
      footer = object(interactive.footer),
      action = object(interactive.action),
      parameters = object(action.parameters)
    const url =
      typeof parameters.url === 'string' && /^https?:\/\//i.test(parameters.url)
        ? parameters.url
        : ''

    return (
      <div className="message-interactive">
        {typeof header.text === 'string' && <strong>{header.text}</strong>}
        <p>
          <WhatsAppText text={body.text} />
        </p>
        {typeof footer.text === 'string' && (
          <div className="interactive-footer">{footer.text}</div>
        )}
        {Array.isArray(action.buttons) &&
          action.buttons.map((button, index) => (
            <span
              className="interactive-choice"
              key={index}
            >
              {String(object(object(button).reply).title || '')}
            </span>
          ))}
        {interactive.type === 'list' && (
          <details>
            <summary>
              <List size={14} />
              {String(action.button || 'Ver opciones')}
            </summary>
            {Array.isArray(action.sections) &&
              action.sections.map((section, index) => (
                <div key={index}>
                  <strong>{String(object(section).title || '')}</strong>
                  {Array.isArray(object(section).rows) &&
                    (object(section).rows as unknown[]).map((row, i) => (
                      <span
                        className="interactive-choice"
                        key={i}
                      >
                        {String(object(row).title || '')}
                      </span>
                    ))}
                </div>
              ))}
          </details>
        )}
        {interactive.type === 'cta_url' && url && (
          <a
            className="interactive-choice"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={14} />
            {String(parameters.display_text || 'Abrir enlace')}
          </a>
        )}
        {interactive.type === 'flow' && (
          <span className="interactive-choice">
            {String(parameters.flow_cta || 'Abrir Flow')}
          </span>
        )}
      </div>
    )
  }

  return (
    <p>
      <WhatsAppText text={messageText(message)} />
    </p>
  )
}

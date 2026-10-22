import type { Message, MessageReference } from '@nubea-ecomm/wapo-sdk'
import { messageText } from '../lib/message-format'
import { WhatsAppText } from './whatsapp-text'

export function MessageQuote({
  reference,
  contactName,
  onJump,
}: {
  reference: MessageReference
  contactName: string
  onJump?: () => void
}) {
  const text = reference.unavailable
    ? 'Mensaje original no disponible'
    : messageText({
        payload: reference.payload || {},
        display_text: reference.display_text,
      } as Message)
  const content = (
    <>
      <strong>
        {reference.unavailable
          ? 'Respuesta'
          : reference.direction === 'outbound'
            ? 'Vos'
            : contactName}
      </strong>
      <span>
        <WhatsAppText text={text} />
      </span>
    </>
  )

  return onJump && !reference.unavailable ? (
    <button
      type="button"
      className="message-quote"
      onClick={onJump}
      title="Ir al mensaje original"
    >
      {content}
    </button>
  ) : (
    <div className="message-quote">{content}</div>
  )
}

import { Check, CheckCheck, Clock, CircleAlert } from 'lucide-react'

export function MessageDeliveryStatus({ status }: { status: string }) {
  const state = {
    pending: { label: 'Enviando', Icon: Clock },
    sent: { label: 'Enviado', Icon: Check },
    delivered: { label: 'Entregado', Icon: CheckCheck },
    read: { label: 'Leído', Icon: CheckCheck },
    played: { label: 'Reproducido', Icon: CheckCheck },
    failed: { label: 'No enviado', Icon: CircleAlert },
  }[status] || { label: 'Estado sin confirmar', Icon: Clock }

  return (
    <span
      className={`message-delivery-status ${status === 'read' || status === 'played' ? 'is-read' : status === 'failed' ? 'is-failed' : ''}`}
      aria-label={state.label}
      title={state.label}
    >
      <state.Icon
        size={13}
        aria-hidden="true"
      />
      <span className="sr-only">{state.label}</span>
    </span>
  )
}

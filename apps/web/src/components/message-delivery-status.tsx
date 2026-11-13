import { Check, CheckCheck, Clock, CircleAlert } from 'lucide-react'

export function MessageDeliveryStatus({
  status,
  reason = '',
}: {
  status: string
  reason?: string
}) {
  const state = {
    pending: { label: 'Enviando', Icon: Clock },
    sent: { label: 'Enviado', Icon: Check },
    delivered: { label: 'Entregado', Icon: CheckCheck },
    read: { label: 'Leído', Icon: CheckCheck },
    played: { label: 'Reproducido', Icon: CheckCheck },
    failed: { label: 'No enviado', Icon: CircleAlert },
  }[status] || { label: 'Estado sin confirmar', Icon: Clock }
  const label =
    status === 'failed' && reason ? `${state.label}: ${reason}` : state.label

  return (
    <span
      className={`message-delivery-status ${status === 'read' || status === 'played' ? 'is-read' : status === 'failed' ? 'is-failed' : ''}`}
      aria-label={label}
      title={label}
    >
      <state.Icon
        size={13}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

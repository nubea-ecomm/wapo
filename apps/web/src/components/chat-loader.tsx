import { LoaderCircle } from 'lucide-react'

export function ChatLoader({
  label = 'Cargando conversación',
  full = false,
}: {
  label?: string
  full?: boolean
}) {
  return (
    <div
      className={`chat-loader${full ? ' chat-loader-full' : ''}`}
      role="status"
      aria-label={label}
      aria-live="polite"
    >
      <LoaderCircle aria-hidden="true" />
      <span>{label}…</span>
    </div>
  )
}

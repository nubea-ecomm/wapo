import type { LogEntry } from '@wapo/sdk'
export const logSources = [
  { id: '', label: 'Todos', color: '' },
  { id: 'api', label: 'API', color: 'bg-blue-500' },
  { id: 'meta', label: 'Meta', color: 'bg-emerald-500' },
  { id: 'messages', label: 'Mensajes', color: 'bg-cyan-500' },
  { id: 'webhooks', label: 'Webhooks', color: 'bg-violet-500' },
  { id: 'events', label: 'Eventos', color: 'bg-neutral-500' },
]
export function logStatus(entry: LogEntry) {
  if (entry.http_status) return `HTTP ${entry.http_status}`
  return (
    (
      {
        ok: 'OK',
        failed: 'Error',
        sent: 'Enviado',
        received: 'Recibido',
        delivered: 'Entregado',
        read: 'Leído',
        pending: 'Pendiente',
        processing: 'En curso',
        cancelled: 'Cancelado',
      } as Record<string, string>
    )[entry.status] || entry.status
  )
}

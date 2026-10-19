import type { Message } from '@wapo/sdk'
export function messageText(message?: Message): string {
  if (!message) return ''
  const text = message.payload.text
  if (
    typeof text === 'object' &&
    text !== null &&
    'body' in text &&
    typeof text.body === 'string'
  )
    return text.body
  const type = message.payload.type
  return typeof type === 'string' ? `[${type}]` : 'Mensaje'
}
export function dateLabel(value?: string): string {
  if (!value) return '-'
  const date = /^\d+$/.test(value) ? new Date(Number(value) * 1000) : new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

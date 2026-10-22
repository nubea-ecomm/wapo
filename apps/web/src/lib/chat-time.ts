import { currentLocale } from './locale'

export function messageDate(value?: string) {
  if (!value) return null

  const date = new Date(/^\d+$/.test(value) ? Number(value) * 1000 : value)

  return Number.isNaN(date.getTime()) ? null : date
}

export function chatDayKey(value?: string) {
  const date = messageDate(value)

  return date
    ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
    : 'unknown'
}

export function messageTime(value?: string) {
  return (
    messageDate(value)?.toLocaleTimeString(currentLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    }) || '—'
  )
}

export function chatDayLabel(value?: string) {
  const date = messageDate(value)

  if (!date) return 'Sin fecha'

  const now = new Date(),
    yesterday = new Date(now)

  yesterday.setDate(now.getDate() - 1)
  const relative =
    chatDayKey(value) === chatDayKey(now.toISOString())
      ? 0
      : chatDayKey(value) === chatDayKey(yesterday.toISOString())
        ? -1
        : null

  if (relative !== null) {
    const label = new Intl.RelativeTimeFormat(currentLocale(), {
      numeric: 'auto',
    }).format(relative, 'day')

    return label.charAt(0).toLocaleUpperCase(currentLocale()) + label.slice(1)
  }

  return date.toLocaleDateString(currentLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

export function conversationTime(value?: string) {
  const now = new Date().toISOString()

  return chatDayKey(value) === chatDayKey(now)
    ? messageTime(value)
    : messageDate(value)?.toLocaleDateString(currentLocale(), {
        day: '2-digit',
        month: '2-digit',
      }) || '—'
}

export function contactInitials(name: string) {
  const parts = name.trim().split(/\s+/)

  return (
    parts.length > 1
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : name.slice(0, 2)
  ).toLocaleUpperCase(currentLocale())
}

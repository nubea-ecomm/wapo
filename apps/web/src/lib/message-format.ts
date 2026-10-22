import type { Message } from '@nubea-ecomm/wapo-sdk'
import { currentLocale } from './locale'

export function messageText(message?: Message): string {
  if (!message) return ''

  if (message.display_text) return message.display_text

  const text = message.payload.text

  if (
    typeof text === 'object' &&
    text !== null &&
    'body' in text &&
    typeof text.body === 'string'
  )
    return text.body

  const type = message.payload.type

  if (type === 'reaction') {
    const reaction = message.payload.reaction as { emoji?: string } | undefined

    return reaction?.emoji
      ? `${reaction.emoji} Reacción a un mensaje`
      : 'Reacción eliminada'
  }

  const interactive = message.payload.interactive as
    Record<string, unknown> | undefined

  if (type === 'interactive' && interactive) {
    for (const key of ['body', 'button_reply', 'list_reply', 'nfm_reply']) {
      const value = interactive[key] as Record<string, unknown> | undefined

      if (typeof value?.text === 'string') return value.text

      if (typeof value?.title === 'string') return value.title

      if (typeof value?.body === 'string') return value.body
    }

    return 'Mensaje interactivo'
  }

  if (type === 'button') {
    const button = message.payload.button as Record<string, unknown> | undefined

    if (typeof button?.text === 'string') return button.text
  }

  const labels: Record<string, string> = {
    audio: 'Audio',
    image: 'Imagen',
    video: 'Video',
    document: 'Documento',
    sticker: 'Sticker',
    contacts: 'Contacto',
  }

  if (typeof type === 'string' && labels[type]) {
    const media = message.payload[type] as Record<string, unknown> | undefined

    return typeof media?.caption === 'string' ? media.caption : labels[type]
  }

  const template = message.payload.template

  if (
    type === 'template' &&
    typeof template === 'object' &&
    template !== null &&
    'name' in template &&
    typeof template.name === 'string'
  )
    return `Template: ${template.name}`

  return typeof type === 'string' ? `[${type}]` : 'Mensaje'
}

export function dateLabel(value?: string): string {
  if (!value) return '-'

  const date = /^\d+$/.test(value)
    ? new Date(Number(value) * 1000)
    : new Date(value)

  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleString(currentLocale(), {
        dateStyle: 'short',
        timeStyle: 'short',
      })
}

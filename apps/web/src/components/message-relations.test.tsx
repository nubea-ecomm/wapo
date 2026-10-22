import { render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Message } from '@nubea-ecomm/wapo-sdk'
import { MessageTimeline } from './message-timeline'

it('renders contextual replies and reactions on the original bubble instead of reaction messages', () => {
  const incoming: Message = {
    id: 'original',
    connection_id: 'con',
    channel: 'whatsapp',
    direction: 'inbound',
    status: 'received',
    timestamp: new Date().toISOString(),
    payload: { type: 'text', text: { body: 'Pregunta original' } },
  }
  const answer: Message = {
    ...incoming,
    id: 'answer',
    direction: 'outbound',
    status: 'read',
    payload: { type: 'text', text: { body: 'Mi respuesta' } },
    reply_to: {
      message_id: 'original',
      unavailable: false,
      direction: 'inbound',
      payload: incoming.payload,
    },
    reactions: [
      {
        emoji: '👍',
        actor: 'contact',
        direction: 'inbound',
        message_id: 'rx',
        status: 'received',
      },
    ],
  }
  const rawReaction: Message = {
    ...incoming,
    id: 'raw',
    payload: {
      type: 'reaction',
      reaction: { message_id: 'answer', emoji: '👍' },
    },
  }
  const { container } = render(
    <MessageTimeline
      messages={[rawReaction, answer, incoming]}
      contactName="Ana Cliente"
      conversationID="conv_example"
      loading={false}
      error={null}
      hasMore={false}
      loadingMore={false}
      loadMore={vi.fn()}
      canInteract
      onReply={vi.fn()}
      onReact={vi.fn()}
    />,
  )

  expect(container.querySelectorAll('article')).toHaveLength(2)
  expect(container.querySelector('.message-quote')).toHaveTextContent(
    'Pregunta original',
  )
  expect(screen.getByLabelText('👍: Ana Cliente')).toBeInTheDocument()
  expect(container.querySelector('.participant-avatar')).toHaveTextContent('AC')
  expect(container.querySelectorAll('.chat-day-divider')).toHaveLength(1)
  expect(screen.getByLabelText('Leído')).toHaveClass('is-read')
})

it('uses a loader without message-shaped placeholders while fetching a chat', () => {
  const { container } = render(
    <MessageTimeline
      messages={[]}
      loading
      error={null}
      hasMore={false}
      loadingMore={false}
      loadMore={vi.fn()}
    />,
  )

  expect(
    screen.getByRole('status', { name: 'Cargando mensajes' }),
  ).toBeInTheDocument()
  expect(container.querySelector('.message-bubble')).toBeNull()
  expect(container.querySelector('[data-slot="skeleton"]')).toBeNull()
})

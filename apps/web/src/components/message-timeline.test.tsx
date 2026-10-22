import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Message } from '@nubea-ecomm/wapo-sdk'
import { MessageTimeline } from './message-timeline'

const message = (id: string, status = 'sent'): Message => ({
  id,
  status,
  direction: 'outbound',
  connection_id: 'con',
  channel: 'whatsapp',
  timestamp: '2026-10-22T12:00:00Z',
  payload: { type: 'text', text: { body: id } },
})
const props = {
  loading: false,
  error: null,
  hasMore: false,
  loadingMore: false,
  loadMore: vi.fn(),
}

it('only shows blue checks after a read receipt and deduplicates overlapping pages', () => {
  const sent = message('sent')
  const { rerender } = render(
    <MessageTimeline
      {...props}
      messages={[sent, sent]}
      pending={message('pending', 'pending')}
    />,
  )

  expect(screen.getAllByText('sent')).toHaveLength(1)
  expect(screen.getByLabelText('Enviado')).not.toHaveClass('is-read')
  expect(screen.getByLabelText('Enviando')).not.toHaveClass('is-read')
  rerender(
    <MessageTimeline
      {...props}
      messages={[message('sent', 'delivered')]}
    />,
  )
  expect(screen.getByLabelText('Entregado')).not.toHaveClass('is-read')
  rerender(
    <MessageTimeline
      {...props}
      messages={[message('sent', 'read'), sent]}
    />,
  )
  expect(screen.getByLabelText('Leído')).toHaveClass('is-read')
  rerender(
    <MessageTimeline
      {...props}
      messages={[message('sent', 'failed')]}
    />,
  )
  expect(screen.getByLabelText('No enviado')).toHaveClass('is-failed')
  expect(screen.queryByLabelText('Leído')).not.toBeInTheDocument()
})

it('keeps the reader in place on new messages and anchors prepended history', () => {
  const { container, rerender } = render(
    <MessageTimeline
      {...props}
      messages={[message('recent')]}
    />,
  )
  const viewport = container.querySelector('.timeline') as HTMLDivElement
  let height = 1000

  Object.defineProperties(viewport, {
    scrollHeight: { get: () => height },
    clientHeight: { value: 300 },
  })
  rerender(
    <MessageTimeline
      {...props}
      messages={[message('recent')]}
    />,
  )
  viewport.scrollTop = 200
  fireEvent.scroll(viewport)
  height = 1100
  rerender(
    <MessageTimeline
      {...props}
      messages={[message('new'), message('recent')]}
    />,
  )
  expect(viewport.scrollTop).toBe(200)
  height = 1500
  rerender(
    <MessageTimeline
      {...props}
      messages={[message('new'), message('recent'), message('older')]}
    />,
  )
  expect(viewport.scrollTop).toBe(600)
  height = 1650
  rerender(
    <MessageTimeline
      {...props}
      messages={[message('new'), message('recent'), message('older')]}
      pending={message('my-reply', 'pending')}
    />,
  )
  expect(viewport.scrollTop).toBe(1650)
})

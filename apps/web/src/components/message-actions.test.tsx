import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import type { Message } from '@nubea-ecomm/wapo-sdk'
import { MessageActions } from './message-actions'

const message: Message = {
  id: 'incoming',
  connection_id: 'con',
  channel: 'whatsapp',
  status: 'received',
  timestamp: new Date().toISOString(),
  direction: 'inbound',
  payload: { type: 'text' },
}

it('keeps reaction errors visible and reuses the logical key for a retry', async () => {
  const send = vi.fn().mockRejectedValue(new Error('Meta no está disponible'))
  const user = userEvent.setup()

  render(
    <MessageActions
      message={message}
      canReply
      canReact
      onReply={vi.fn()}
      onReact={send}
    />,
  )
  await user.click(
    screen.getByRole('button', { name: 'Reaccionar a este mensaje' }),
  )
  await user.click(screen.getByRole('button', { name: 'Reaccionar con 👍' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Meta no está disponible',
  )
  const firstKey = send.mock.calls[0][1]

  await user.click(screen.getByRole('button', { name: 'Reaccionar con 👍' }))
  await waitFor(() => expect(send).toHaveBeenCalledTimes(2))
  expect(send.mock.calls[1]).toEqual(['👍', firstKey])
})

it('removes an existing business reaction when selecting the same emoji', async () => {
  const send = vi.fn().mockResolvedValue({})
  const user = userEvent.setup()

  render(
    <MessageActions
      message={{
        ...message,
        reactions: [
          {
            emoji: '❤️',
            actor: 'business',
            direction: 'outbound',
            message_id: 'reaction',
            status: 'sent',
          },
        ],
      }}
      canReply
      canReact
      onReply={vi.fn()}
      onReact={send}
    />,
  )
  await user.click(
    screen.getByRole('button', { name: 'Reaccionar a este mensaje' }),
  )
  await user.click(screen.getByRole('button', { name: 'Reaccionar con ❤️' }))
  expect(send).toHaveBeenCalledWith('', expect.any(String))
})

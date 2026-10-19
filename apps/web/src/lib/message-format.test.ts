import { describe, it, expect } from 'vitest'
import type { Message } from '@wapo/sdk'
import { messageText, dateLabel } from './message-format'
const base: Message = {
  id: 'msg',
  connection_id: 'con',
  channel: 'webchat',
  direction: 'inbound',
  status: 'received',
  timestamp: '1700000000',
  payload: {},
}
describe('provider message presentation', () => {
  it('renders text and unsupported media without treating provider content as markup', () => {
    expect(
      messageText({ ...base, payload: { text: { body: '<script>hello</script>' } } }),
    ).toBe('<script>hello</script>')
    expect(messageText({ ...base, payload: { type: 'image' } })).toBe('[image]')
    expect(messageText()).toBe('')
  })
  it('normalizes Meta Unix seconds and native ISO timestamps to the same display time', () => {
    expect(dateLabel('1700000000')).toBe(dateLabel('2023-11-14T22:13:20Z'))
    expect(dateLabel('invalid')).toBe('-')
    expect(dateLabel()).toBe('-')
  })
})

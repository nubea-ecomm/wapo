import { describe, expect, it, vi } from 'vitest'
import { avatarHash, nextAvatarVariant } from './avatar'

describe('nextAvatarVariant', () => {
  it('always produces a visually distinct avatar hash', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const values = array as Uint32Array
      values[0] = values[0] === 0 ? 7 : values[0] + 1
      return array
    })
    const current = 0
    const next = nextAvatarVariant('user-a', current)
    expect(avatarHash(`user-a${next}`)).not.toBe(avatarHash(`user-a${current}`))
  })
})

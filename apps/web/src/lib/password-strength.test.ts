import { expect, it } from 'vitest'
import { passwordBytes, passwordScore } from './password-strength'

it('uses UTF-8 bytes consistently with the backend password limit', () => {
  expect(passwordBytes('🔐'.repeat(19))).toBe(76)
  expect(passwordBytes('é'.repeat(6))).toBe(12)
})
it('recognizes predictable passwords instead of trusting length or character variety', async () => {
  expect(await passwordScore('Password123!')).toBeLessThan(3)
  expect(await passwordScore('aaaaaaaaaaaaaaaaaaaaaaaa')).toBeLessThan(3)
  expect(
    await passwordScore('glacier canoe velvet orbital 748!'),
  ).toBeGreaterThanOrEqual(3)
})

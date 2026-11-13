import { describe, expect, it } from 'vitest'
import { failureReason } from './message-failure'

describe('failureReason', () => {
  it('reads the first Meta status error', () => {
    expect(
      failureReason([
        {
          status: 'failed',
          errors: [
            { code: 131042, title: 'Business eligibility payment issue' },
          ],
        },
      ]),
    ).toBe('131042 · Business eligibility payment issue')
  })

  it('prefers the detailed message and ignores missing errors', () => {
    expect(
      failureReason([
        {
          errors: [
            { code: 131026, title: 'x', message: 'Message undeliverable' },
          ],
        },
      ]),
    ).toBe('131026 · Message undeliverable')
    expect(failureReason([{ status: 'failed' }])).toBe('')
    expect(failureReason(undefined)).toBe('')
  })
})

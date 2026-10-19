import { describe, expect, it } from 'vitest'
import { WapoError } from '@wapo/sdk'
import { apiErrorCode, isCredentialExpired } from './api-error'

describe('API error classification', () => {
  it('recognizes an expired provider credential without matching error text', () => {
    const error = new WapoError(409, {
      error: { code: 'credential_expired', message: 'Credential unavailable' },
    })

    expect(apiErrorCode(error)).toBe('credential_expired')
    expect(isCredentialExpired(error)).toBe(true)
  })

  it('does not classify unrelated failures as credential expiration', () => {
    expect(
      isCredentialExpired(new Error('Error validating access token')),
    ).toBe(false)
  })
})

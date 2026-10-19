import { WapoError } from '@nubea-ecomm/wapo-sdk'

export function apiErrorCode(error: unknown) {
  if (
    !(error instanceof WapoError) ||
    typeof error.body !== 'object' ||
    !error.body
  )
    return ''

  const body = error.body as { error?: { code?: unknown } }

  return typeof body.error?.code === 'string' ? body.error.code : ''
}

export function isCredentialExpired(error: unknown) {
  return apiErrorCode(error) === 'credential_expired'
}

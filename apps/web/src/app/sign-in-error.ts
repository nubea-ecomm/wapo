import { WapoError } from '@nubea-ecomm/wapo-sdk'

type SignInMessage =
  'signInError' | 'signInInvalid' | 'signInRateLimited' | 'signInUnreachable'

// Tell the person why the sign-in failed instead of one generic message, e.g. a
// throttled attempt or an unreachable server versus wrong credentials.
export function signInErrorMessage(error: unknown): SignInMessage {
  if (error instanceof WapoError) {
    if (error.status === 401) return 'signInInvalid'

    if (error.status === 429) return 'signInRateLimited'

    return 'signInError'
  }

  return error instanceof TypeError ? 'signInUnreachable' : 'signInError'
}

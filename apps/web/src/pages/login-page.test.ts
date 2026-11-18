import { WapoError } from '@nubea-ecomm/wapo-sdk'
import { afterEach, expect, it } from 'vitest'
import { signInErrorMessage } from '../app/sign-in-error'
import {
  forgetPendingJoin,
  rememberPendingJoin,
  resumePendingJoin,
} from '../app/pending-join'

afterEach(() => {
  forgetPendingJoin()
  location.hash = ''
})

it('explains why the sign-in failed', () => {
  expect(signInErrorMessage(new WapoError(401, {}))).toBe('signInInvalid')
  expect(signInErrorMessage(new WapoError(403, {}))).toBe('signInError')
  expect(signInErrorMessage(new WapoError(429, {}))).toBe('signInRateLimited')
  expect(signInErrorMessage(new WapoError(500, {}))).toBe('signInError')
  expect(signInErrorMessage(new TypeError('Failed to fetch'))).toBe(
    'signInUnreachable',
  )
})

it('returns to a pending project invitation after signing in', () => {
  rememberPendingJoin('#/join-project?token=invite_abc')
  location.hash = '#/'
  resumePendingJoin()
  expect(location.hash).toBe('#/join-project?token=invite_abc')
  // Resuming consumes the link, so another account is not sent back repeatedly.
  location.hash = '#/'
  resumePendingJoin()
  expect(location.hash).toBe('#/')
})

it('ignores anything that is not a project invitation link', () => {
  rememberPendingJoin('#/users')
  location.hash = '#/'
  resumePendingJoin()
  expect(location.hash).toBe('#/')
})

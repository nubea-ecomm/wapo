import { afterEach, expect, it, vi } from 'vitest'
import { persistSession, restoreSession } from './session-storage'
import type { Session } from './session-context'

const session: Session = {
  id: 'session-id',
  url: 'http://localhost:8080',
  key: 'opaque-session-token',
  role: 'operator',
  tenantId: 'tenant-b',
  tenantName: 'B',
  user: {
    id: 'user',
    role: 'admin',
    all_projects: true,
    project_ids: [],
    email: 'admin@example.com',
    name: 'Admin',
    language: 'es',
    avatar_variant: 0,
    active: true,
    created_at: '',
  },
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
}

afterEach(() => {
  vi.unstubAllEnvs()
  sessionStorage.clear()
  localStorage.clear()
})

it('requires login on the configured API after a domain change instead of forwarding the old token', () => {
  vi.stubEnv('VITE_API_URL', 'https://api.getwapo.dev')
  persistSession({
    ...session,
    url: 'https://old.apps.unbroker.cloud',
    remember: true,
  })
  expect(restoreSession()).toBeNull()
  expect(localStorage.length).toBe(0)
  persistSession({ ...session, url: 'https://api.getwapo.dev/' })
  expect(restoreSession()?.url).toBe('https://api.getwapo.dev/')
})
it('restores an unexpired user session and its selected tenant after reload', () => {
  persistSession(session)
  expect(restoreSession()).toEqual(session)
  expect(localStorage.length).toBe(0)
  persistSession(null)
  expect(restoreSession()).toBeNull()
})
it('discards expired or corrupted sessions and does not save technical API keys', () => {
  persistSession({ ...session, expiresAt: new Date(0).toISOString() })
  expect(restoreSession()).toBeNull()
  sessionStorage.setItem('wapo.console-session', '{broken')
  expect(restoreSession()).toBeNull()
  persistSession({ ...session, user: undefined })
  expect(sessionStorage.length).toBe(0)
})

it('remembers the user across browser sessions only when requested, and clears it on logout', () => {
  persistSession({ ...session, remember: true })
  expect(sessionStorage.length).toBe(0)
  expect(restoreSession()?.user?.email).toBe(session.user?.email)
  persistSession(null)
  expect(localStorage.length).toBe(0)
  expect(restoreSession()).toBeNull()
})

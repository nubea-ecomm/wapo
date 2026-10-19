import type { Session } from './session-context'

const storageKey = 'wapo.console-session'

export function restoreSession(): Session | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(storageKey) ||
        localStorage.getItem(storageKey) ||
        'null',
    )
    if (
      value?.user &&
      value.role === 'operator' &&
      typeof value.key === 'string' &&
      typeof value.url === 'string' &&
      typeof value.tenantId === 'string' &&
      typeof value.tenantName === 'string' &&
      typeof value.id === 'string' &&
      Date.parse(value.expiresAt) > Date.now()
    ) {
      return value as Session
    }
    sessionStorage.removeItem(storageKey)
    localStorage.removeItem(storageKey)
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
  return null
}

export function persistSession(session: Session | null) {
  try {
    sessionStorage.removeItem(storageKey)
    localStorage.removeItem(storageKey)
    if (session?.user && session.expiresAt) {
      const storage = session.remember ? localStorage : sessionStorage
      storage.setItem(storageKey, JSON.stringify(session))
    }
  } catch {
    // Login remains available even when browser storage is disabled.
  }
}

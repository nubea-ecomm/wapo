import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from 'react'
import {
  WapoAdminClient,
  WapoAuthClient,
  WapoError,
} from '@nubea-ecomm/wapo-sdk'
import type { QueryClient } from '@tanstack/react-query'
import type { Session } from './session-context'

export function useAccessRefresh(
  session: Session | null,
  setSession: Dispatch<SetStateAction<Session | null>>,
  queryClient: QueryClient,
) {
  const sequence = useRef(0)
  const selecting = useRef(false)
  const invalidate = useCallback(() => {
    sequence.current++
    selecting.current = false
  }, [])
  const key = session?.key,
    url = session?.url,
    userID = session?.user?.id
  const refreshAccess = useCallback(
    async (preferredProject?: string) => {
      if (!key || !url || !userID) return

      const request = ++sequence.current

      if (preferredProject !== undefined) selecting.current = true

      try {
        const [profile, projects] = await Promise.all([
          new WapoAuthClient({ baseUrl: url, apiKey: key }).me(),
          new WapoAdminClient({ baseUrl: url, apiKey: key }).listTenants(),
        ])

        if (request !== sequence.current) return

        setSession((current) => {
          if (!current || current.key !== key || request !== sequence.current)
            return current

          const active =
            projects.data.find(
              (project) =>
                project.id === (preferredProject ?? current.tenantId) &&
                project.status === 'active',
            ) || projects.data.find((project) => project.status === 'active')

          if (
            JSON.stringify(profile.data.user) ===
              JSON.stringify(current.user) &&
            current.tenantId === (active?.id || '') &&
            current.tenantName === (active?.name || '')
          )
            return current

          return {
            ...current,
            id: crypto.randomUUID(),
            user: profile.data.user,
            tenantId: active?.id || '',
            tenantName: active?.name || '',
          }
        })
      } catch (error) {
        if (
          request === sequence.current &&
          error instanceof WapoError &&
          error.status === 401
        ) {
          queryClient.clear()
          setSession((current) => (current?.key === key ? null : current))
        }

        throw error
      } finally {
        if (request === sequence.current) selecting.current = false
      }
    },
    [key, url, userID, setSession, queryClient],
  )

  useEffect(() => {
    if (!userID) return

    const refresh = () => {
      if (!selecting.current) void refreshAccess().catch(() => {})
    }

    refresh()
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 60_000)

    return () => {
      invalidate()
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [refreshAccess, userID, invalidate])

  return refreshAccess
}

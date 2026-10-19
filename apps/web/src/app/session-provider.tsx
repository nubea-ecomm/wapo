import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  WapoAdminClient,
  WapoClient,
  WapoAuthClient,
  WapoError,
} from '@wapo/sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { persistSession, restoreSession } from './session-storage'
import { SessionContext, type Session } from './session-context'
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(restoreSession)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  )
  useEffect(() => {
    persistSession(session)
    if (!session?.expiresAt) return
    const timer = window.setTimeout(
      () => {
        persistSession(null)
        queryClient.clear()
        setSession(null)
      },
      Math.max(0, Date.parse(session.expiresAt) - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [session, queryClient])
  const sessionUserID = session?.user?.id
  useEffect(() => {
    if (!sessionUserID) return
    let cancelled = false
    const key = session?.key || '',
      url = session?.url || ''
    async function refreshAccess() {
      try {
        const [profile, projects] = await Promise.all([
          new WapoAuthClient({ baseUrl: url, apiKey: key }).me(),
          new WapoAdminClient({ baseUrl: url, apiKey: key }).listTenants(),
        ])
        if (cancelled) return
        setSession((current) => {
          if (!current || current.key !== key) return current
          const active =
            projects.data.find(
              (project) =>
                project.id === current.tenantId && project.status === 'active',
            ) || projects.data.find((project) => project.status === 'active')
          const updated =
            JSON.stringify(profile.data.user) !==
              JSON.stringify(current.user) ||
            current.tenantId !== (active?.id || '') ||
            current.tenantName !== (active?.name || '')
          if (!updated) return current
          return {
            ...current,
            id: crypto.randomUUID(),
            user: profile.data.user,
            tenantId: active?.id || '',
            tenantName: active?.name || '',
          }
        })
      } catch (error) {
        if (!cancelled && error instanceof WapoError && error.status === 401) {
          queryClient.clear()
          setSession(null)
        }
      }
    }
    void refreshAccess()
    const refresh = () => void refreshAccess()
    window.addEventListener('focus', refresh)
    const timer = window.setInterval(refresh, 60_000)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [sessionUserID, session?.key, session?.url, queryClient])
  const options = useMemo(
    () => ({
      baseUrl: session?.url || 'http://localhost:8080',
      apiKey: session?.key || '',
      ...(session?.role === 'operator' ? { tenantId: session.tenantId } : {}),
    }),
    [session],
  )
  const client = useMemo(() => new WapoClient(options), [options])
  const admin = useMemo(() => new WapoAdminClient(options), [options])
  async function connect(url: string, key: string, role: Session['role']) {
    const options = { baseUrl: url.replace(/\/$/, ''), apiKey: key }
    let tenantId: string, tenantName: string
    if (role === 'operator') {
      await new WapoAdminClient(options).me()
      const tenants = await new WapoAdminClient(options).listTenants()
      const tenant = tenants.data.find((t) => t.status === 'active')
      tenantId = tenant?.id || ''
      tenantName = tenant?.name || ''
    } else {
      const me = await new WapoClient(options).me()
      tenantId = me.data.project_id
      tenantName = tenantId
    }
    queryClient.clear()
    setSession({
      id: crypto.randomUUID(),
      url: options.baseUrl,
      key,
      role,
      tenantId,
      tenantName,
    })
  }
  async function connectUser(
    url: string,
    email: string,
    password: string,
    remember = false,
  ) {
    const normalized = url.replace(/\/$/, '')
    const result = await new WapoAuthClient({
      baseUrl: normalized,
      apiKey: '',
    }).login(email, password)
    const tenants = await new WapoAdminClient({
      baseUrl: normalized,
      apiKey: result.data.token,
    }).listTenants()
    const tenant =
      tenants.data.find((t) => t.id === 'default' && t.status === 'active') ||
      tenants.data.find((t) => t.status === 'active')
    queryClient.clear()
    setSession({
      id: crypto.randomUUID(),
      url: normalized,
      key: result.data.token,
      role: 'operator',
      tenantId: tenant?.id || '',
      tenantName: tenant?.name || '',
      user: result.data.user,
      expiresAt: result.data.expires_at,
      remember,
    })
  }
  function selectTenant(id: string, name: string) {
    queryClient.clear()
    setSession((current) =>
      current
        ? {
            ...current,
            id: crypto.randomUUID(),
            tenantId: id,
            tenantName: name,
          }
        : null,
    )
  }
  function disconnect() {
    persistSession(null)
    if (session?.user) {
      void new WapoAuthClient({ baseUrl: session.url, apiKey: session.key })
        .logout()
        .catch(() =>
          console.warn(
            'Console session could not be revoked; it will expire automatically.',
          ),
        )
    }
    queryClient.clear()
    setSession(null)
  }
  async function updateProfile(input: {
    name?: string
    email?: string
    language?: 'es' | 'pt' | 'en'
    avatar_variant?: number
  }) {
    if (!session?.user) throw new Error('A console session is required')
    const result = await new WapoAuthClient({
      baseUrl: session.url,
      apiKey: session.key,
    }).updateProfile(input)
    setSession((current) =>
      current
        ? { ...current, id: crypto.randomUUID(), user: result.data.user }
        : null,
    )
  }
  return (
    <SessionContext.Provider
      value={{
        session,
        client,
        admin,
        connect,
        connectUser,
        selectTenant,
        disconnect,
        updateProfile,
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionContext.Provider>
  )
}

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  WapoAdminClient,
  WapoClient,
  WapoAuthClient,
} from '@nubea-ecomm/wapo-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { persistSession, restoreSession } from './session-storage'
import { SessionContext, type Session } from './session-context'
import { useAccessRefresh } from './use-access-refresh'

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
  const refreshAccess = useAccessRefresh(session, setSession, queryClient)
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
        refreshAccess,
      }}
    >
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </SessionContext.Provider>
  )
}

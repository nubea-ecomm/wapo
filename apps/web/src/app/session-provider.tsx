import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  WapoAdminClient,
  WapoClient,
  WapoAuthClient,
  type ConsoleSession,
} from '@nubea-ecomm/wapo-sdk'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { persistSession, restoreSession } from './session-storage'
import {
  SessionContext,
  type RegistrationInput,
  type Session,
} from './session-context'
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

  async function startUserSession(
    url: string,
    result: ConsoleSession,
    remember: boolean,
    preferredProject?: string,
  ) {
    const tenants = await new WapoAdminClient({
      baseUrl: url,
      apiKey: result.token,
    }).listTenants()
    const active = tenants.data.filter((t) => t.status === 'active')
    const tenant =
      active.find((t) => t.id === preferredProject) ||
      active.find((t) => t.id === 'default') ||
      active[0]

    queryClient.clear()
    setSession({
      id: crypto.randomUUID(),
      url,
      key: result.token,
      role: 'operator',
      tenantId: tenant?.id || '',
      tenantName: tenant?.name || '',
      user: result.user,
      expiresAt: result.expires_at,
      remember,
    })
  }

  async function connectUser(
    url: string,
    email: string,
    password: string,
    remember = false,
    invitationToken?: string,
  ) {
    const normalized = url.replace(/\/$/, '')
    const result = await new WapoAuthClient({
      baseUrl: normalized,
      apiKey: '',
    }).login(email, password)
    let project: string | undefined

    if (invitationToken) {
      const auth = new WapoAuthClient({
        baseUrl: normalized,
        apiKey: result.data.token,
      })

      try {
        project = (await auth.acceptProjectInvitation(invitationToken)).data
          .project_id
      } catch (error) {
        // Do not leave an unused server session behind when joining fails.
        await auth.logout().catch(() => undefined)
        throw error
      }
    }

    await startUserSession(normalized, result.data, remember, project)
  }

  async function registerUser(
    url: string,
    input: RegistrationInput,
    remember = false,
  ) {
    const normalized = url.replace(/\/$/, '')
    const result = await new WapoAuthClient({
      baseUrl: normalized,
      apiKey: '',
    }).register(input)

    await startUserSession(
      normalized,
      result.data,
      remember,
      result.data.invitation?.project_id,
    )
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
      current && current.key === session.key
        ? { ...current, user: result.data.user }
        : current,
    )
    // Profile preferences do not change project scope. Preserve the page instance
    // (including its selected settings tab) while refreshing cached profile data.
    void queryClient.invalidateQueries({ queryKey: [session.id] })
  }

  return (
    <SessionContext.Provider
      value={{
        session,
        client,
        admin,
        connect,
        connectUser,
        registerUser,
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

import { createContext, useContext } from 'react'
import type {
  WapoAdminClient,
  WapoClient,
  ConsoleUser,
} from '@nubea-ecomm/wapo-sdk'

export interface Session {
  id: string
  url: string
  key: string
  role: 'operator' | 'project'
  tenantId: string
  user?: ConsoleUser
  remember?: boolean
  expiresAt?: string
  tenantName: string
}

export interface SessionContextValue {
  refreshAccess: (preferredProject?: string) => Promise<void>
  session: Session | null
  client: WapoClient
  admin: WapoAdminClient
  connect: (url: string, key: string, role: Session['role']) => Promise<void>
  connectUser: (
    url: string,
    email: string,
    password: string,
    remember?: boolean,
  ) => Promise<void>
  selectTenant: (id: string, name: string) => void
  disconnect: () => void
  updateProfile: (input: {
    name?: string
    email?: string
    language?: 'es' | 'pt' | 'en'
    avatar_variant?: number
  }) => Promise<void>
}

export const SessionContext = createContext<SessionContextValue | null>(null)

export function useSession() {
  const value = useContext(SessionContext)

  if (!value) throw new Error('SessionProvider is missing')

  return value
}

import { WhatsAppIcon } from '../components/icons/whatsapp-icon'
import {
  LayoutDashboard,
  FileText,
  Building2,
  UsersRound,
  KeyRound,
  MessagesSquare,
  Webhook,
  Activity,
  Settings2,
  Plug,
  Layers,
  SlidersHorizontal,
  ContactRound,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { MessageKey } from './i18n'

export type NavigationGroup =
  'main' | 'integrations' | 'multitenant' | 'project'

export type NavigationItem = {
  to: string
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  group: NavigationGroup
  operator: boolean
} & (
  { labelKey: MessageKey; label?: never } | { label: string; labelKey?: never }
)

export const navigation = [
  {
    to: '/templates',
    labelKey: 'templates',
    icon: FileText,
    group: 'integrations',
    operator: false,
  },
  {
    to: '/',
    labelKey: 'overview',
    icon: LayoutDashboard,
    group: 'main',
    operator: false,
  },
  {
    to: '/connections',
    labelKey: 'connections',
    icon: WhatsAppIcon,
    group: 'main',
    operator: false,
  },
  {
    to: '/inbox',
    labelKey: 'inbox',
    icon: MessagesSquare,
    group: 'main',
    operator: false,
  },
  {
    to: '/contacts',
    labelKey: 'contacts',
    icon: ContactRound,
    group: 'main',
    operator: false,
  },
  {
    to: '/api-keys',
    label: 'API keys',
    icon: KeyRound,
    group: 'integrations',
    operator: false,
  },
  {
    to: '/webhooks',
    label: 'Webhooks',
    icon: Webhook,
    group: 'integrations',
    operator: false,
  },
  {
    to: '/events',
    labelKey: 'observability',
    icon: Activity,
    group: 'integrations',
    operator: false,
  },
  {
    to: '/customers',
    labelKey: 'customers',
    icon: UsersRound,
    group: 'multitenant',
    operator: false,
  },
  {
    to: '/tenants',
    labelKey: 'projects',
    icon: Building2,
    group: 'multitenant',
    operator: true,
  },
  {
    to: '/users',
    labelKey: 'users',
    icon: UsersRound,
    group: 'multitenant',
    operator: true,
  },
  {
    to: '/settings',
    labelKey: 'settings',
    icon: Settings2,
    group: 'project',
    operator: false,
  },
] satisfies NavigationItem[]

export const navigationGroups = [
  { key: 'integrations', icon: Plug },
  { key: 'multitenant', icon: Layers },
  { key: 'project', icon: SlidersHorizontal },
] satisfies { key: NavigationGroup; icon: ComponentType }[]

export function navigationLabel(
  item: NavigationItem,
  translate: (key: MessageKey) => string,
) {
  return item.labelKey ? translate(item.labelKey) : item.label
}

export interface Page<T> {
  data: T[]
  meta?: { has_more: boolean; after: string }
  paging?: { cursors: { after: string } }
}

export interface Customer {
  id: string
  name: string
  external_customer_id?: string | null
  email?: string
  metadata?: Record<string, unknown>
}

export interface Connection {
  id: string
  channel: 'webchat' | 'whatsapp'
  name?: string
  customer_id?: string
  external_id?: string
  business_account_id?: string
  display_phone_number?: string
  status: string
  connection_type?: 'dedicated' | 'coexistence'
  health_status?: 'healthy' | 'error' | 'warning' | 'unknown'
  health_issues?: number
  health_checked_at?: string
  credential_status?: 'valid' | 'expired'
  access_token_expires_at?: string
}

export type BusinessVertical =
  | 'ALCOHOL'
  | 'APPAREL'
  | 'AUTO'
  | 'BEAUTY'
  | 'EDU'
  | 'ENTERTAIN'
  | 'EVENT_PLAN'
  | 'FINANCE'
  | 'GOVT'
  | 'GROCERY'
  | 'HEALTH'
  | 'HOTEL'
  | 'NONPROFIT'
  | 'ONLINE_GAMBLING'
  | 'OTC_DRUGS'
  | 'OTHER'
  | 'PHYSICAL_GAMBLING'
  | 'PROF_SERVICES'
  | 'RESTAURANT'
  | 'RETAIL'
  | 'TRAVEL'

export interface BusinessProfile {
  about?: string
  address?: string
  description?: string
  email?: string
  profile_picture_url?: string
  websites?: string[]
  vertical?: BusinessVertical
}

export interface BusinessProfileInput extends Omit<
  BusinessProfile,
  'profile_picture_url'
> {
  profile_picture_handle?: string
}

export type ContactProperty = string | number | boolean | null

export interface MarketingPreference {
  status: 'stopped' | 'resumed'
  marketing_allowed: boolean
  detail: string
  source: '' | 'meta_webhook' | 'meta_delivery_error' | 'meta_synchronous_error'
  sequence: number
  last_event_at?: string
}

export interface Contact {
  id: string
  connection_id: string
  customer_id?: string
  wa_id: string
  phone_number: string
  business_scoped_user_id?: string
  parent_business_scoped_user_id?: string
  username?: string
  profile_name?: string
  display_name: string
  display_name_source: 'local' | 'meta' | 'username' | 'phone'
  email?: string
  properties: Record<string, ContactProperty>
  phone_number_id: string
  connection_name?: string
  marketing_preference: MarketingPreference
  created_at: string
  updated_at: string
}

export interface ContactInput {
  connection_id: string
  phone_number: string
  display_name: string
  email?: string
  properties?: Record<string, ContactProperty>
}

export interface Message {
  id: string
  connection_id: string
  conversation_id?: string
  channel: string
  direction: 'inbound' | 'outbound'
  status: string
  to?: string
  from?: string
  timestamp: string
  payload: Record<string, unknown>
  display_text?: string
}

export interface Conversation {
  id: string
  connection_id: string
  customer_id?: string
  channel: string
  contact: string
  contact_name?: string
  status: 'open' | 'closed'
  assigned_to: string
  last_message: Message
  updated_at: string
  service_window_open?: boolean
  service_window_expires_at?: string
  has_unread?: boolean
  last_inbound_message_id?: string
}

export interface Webhook {
  id: string
  url: string
  events: string[]
  active: boolean
  connection_id?: string
}

export interface Project {
  logo_url?: string
  id: string
  name: string
  status: 'active' | 'suspended'
  created_at?: string
  active_keys?: number
}

export interface ApiKey {
  id: string
  name: string
  prefix: string
  key?: string
  created_at?: string
  revoked_at?: string | null
}

export interface ProjectEvent {
  id: string
  event: string
  payload: Record<string, unknown>
  created_at: string
}

export interface SetupLink {
  id: string
  customer_id: string
  status: 'active' | 'completed' | 'used' | 'expired' | 'revoked'
  allowed_connection_types: ('coexistence' | 'dedicated')[]
  expires_at: string
  url?: string
  token?: string
  whatsapp_setup_status: string
}

export interface SetupLinkInput {
  allowed_connection_types?: ('coexistence' | 'dedicated')[]
  success_redirect_url?: string
  failure_redirect_url?: string
  language?: 'en' | 'es' | 'pt' | 'hi' | 'id' | 'ar'
  expires_at?: string
  allowed_origins?: string[]
  theme_config?: Record<string, string>
  reconnect_phone_number?: string
  meta_billing_mode?: 'customer_managed'
  provision_phone_number?: false
}

export interface ClientOptions {
  baseUrl: string
  apiKey: string
  tenantId?: string
  fetch?: typeof fetch
  timeoutMs?: number
}

export interface CustomerInput {
  name: string
  external_customer_id?: string
  email?: string
  metadata?: Record<string, unknown>
}

export interface ConsoleUser {
  project_roles?: Record<string, 'admin' | 'member' | 'viewer' | 'billing'>
  role: UserRole
  all_projects: boolean
  project_ids: string[]
  id: string
  email: string
  name: string
  language: 'es' | 'pt' | 'en'
  avatar_variant: number
  active: boolean
  invitation_pending?: boolean
  created_at: string
}

export interface WhatsAppSettings {
  onboarding_ready: boolean
  public_url: string
  graph_version: string
  public_https: boolean
  credentials: Record<
    | 'META_APP_ID'
    | 'META_APP_SECRET'
    | 'META_EMBEDDED_SIGNUP_CONFIG_ID'
    | 'META_VERIFY_TOKEN',
    boolean
  >
}

export interface ProjectSettings extends Project {
  branding: {
    logo_data_url: string
    accent_color: string
    theme: 'light' | 'dark'
  }
}

export interface NotificationSettings {
  recipients: string[]
  whatsapp_disconnected: boolean
  customer_needs_attention: boolean
  daily_stats: boolean
  weekly_stats: boolean
  smtp_configured: boolean
  project_users: Array<{ id: string; name: string; email: string }>
}

export interface LogEntry {
  id: string
  source: 'api' | 'meta' | 'messages' | 'webhooks' | 'events'
  summary: string
  details: string
  status: string
  http_status: number | null
  duration_ms: number | null
  request_id: string
  created_at: string
  is_error: boolean
  metadata: Record<string, unknown>
}

export type UserRole = 'admin' | 'member' | 'billing' | 'viewer'

export interface MessageTemplate {
  id: string
  name: string
  language: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  status: string
  components: Record<string, unknown>[]
  rejected_reason?: string
}

export interface TemplateInput {
  name: string
  language: string
  category: MessageTemplate['category']
  components: Record<string, unknown>[]
  allow_category_change?: boolean
  parameter_format?: 'POSITIONAL' | 'NAMED'
}

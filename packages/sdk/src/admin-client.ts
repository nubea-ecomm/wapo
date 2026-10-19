import { Transport } from './transport.js'
import type {
  UserRole,
  ApiKey,
  Page,
  Project,
  ConsoleUser,
  WhatsAppSettings,
} from './types.js'

export class WapoAdminClient extends Transport {
  whatsappSettings() {
    return this.request<{ data: WhatsAppSettings }>(
      'GET',
      '/admin/v1/settings/whatsapp',
    )
  }
  listUsers() {
    return this.request<Page<ConsoleUser>>('GET', '/admin/v1/users')
  }
  createUser(input: {
    name: string
    email: string
    password: string
    role?: UserRole
    all_projects?: boolean
    project_ids?: string[]
  }) {
    return this.request<{ data: ConsoleUser }>('POST', '/admin/v1/users', input)
  }
  updateUser(
    id: string,
    input: {
      active?: boolean
      password?: string
      role?: UserRole
      all_projects?: boolean
      project_ids?: string[]
    },
  ) {
    return this.request(
      'PATCH',
      `/admin/v1/users/${encodeURIComponent(id)}`,
      input,
    )
  }
  deleteUser(id: string) {
    return this.request('DELETE', `/admin/v1/users/${encodeURIComponent(id)}`)
  }
  me() {
    return this.request<{ data: { role: 'operator' } }>('GET', '/admin/v1/me')
  }
  listTenants() {
    return this.request<Page<Project>>('GET', '/admin/v1/tenants')
  }
  createTenant(name: string) {
    return this.request<{ data: Project }>('POST', '/admin/v1/tenants', {
      name,
    })
  }
  deleteTenant(id: string) {
    return this.request('DELETE', `/admin/v1/tenants/${encodeURIComponent(id)}`)
  }
  updateTenant(
    id: string,
    input: { name?: string; status?: 'active' | 'suspended' },
  ) {
    return this.request<{ data: Project }>(
      'PATCH',
      `/admin/v1/tenants/${encodeURIComponent(id)}`,
      input,
    )
  }
  listApiKeys(tenant: string) {
    return this.request<Page<ApiKey>>(
      'GET',
      `/admin/v1/tenants/${encodeURIComponent(tenant)}/api_keys`,
    )
  }
  createApiKey(tenant: string, name: string) {
    return this.request<{ data: ApiKey }>(
      'POST',
      `/admin/v1/tenants/${encodeURIComponent(tenant)}/api_keys`,
      { name },
    )
  }
  revokeApiKey(tenant: string, id: string) {
    return this.request(
      'DELETE',
      `/admin/v1/tenants/${encodeURIComponent(tenant)}/api_keys/${encodeURIComponent(id)}`,
    )
  }
}

import { Transport } from './transport.js'
import type {
  ApiKey,
  MessageTemplate,
  TemplateInput,
  ProjectSettings,
  Connection,
  Conversation,
  Customer,
  CustomerInput,
  Message,
  Page,
  SetupLink,
  SetupLinkInput,
  Webhook,
} from './types.js'
const encode = encodeURIComponent
export class WapoClient extends Transport {
  project() {
    return this.request<{ data: ProjectSettings }>('GET', '/v1/project')
  }
  updateProject(input: {
    name?: string
    branding?: Partial<ProjectSettings['branding']>
  }) {
    return this.request<{ data: ProjectSettings }>('PATCH', '/v1/project', input)
  }
  me() {
    return this.request<{
      data: { project_id: string; compatibility_mode: boolean; onboarding_ready: boolean }
    }>('GET', '/v1/me')
  }
  listTemplates(connectionId: string, after = '') {
    return this.request<Page<MessageTemplate>>(
      'GET',
      `/v1/connections/${encode(connectionId)}/templates${after ? `?after=${encode(after)}` : ''}`,
    )
  }
  createTemplate(connectionId: string, input: TemplateInput) {
    return this.request<{ data: Pick<MessageTemplate, 'id' | 'status' | 'category'> }>(
      'POST',
      `/v1/connections/${encode(connectionId)}/templates`,
      input,
    )
  }
  listCustomers() {
    return this.request<Page<Customer>>('GET', '/v1/customers')
  }
  createCustomer(input: CustomerInput) {
    return this.request<{ data: Customer }>('POST', '/v1/customers', input)
  }
  updateCustomer(id: string, input: Partial<CustomerInput>) {
    return this.request<{ data: Customer }>('PATCH', `/v1/customers/${encode(id)}`, input)
  }
  deleteCustomer(id: string) {
    return this.request('DELETE', `/v1/customers/${encode(id)}`)
  }
  listConnections() {
    return this.request<Page<Connection>>('GET', '/v1/connections')
  }
  createConnection(input: {
    channel: 'webchat' | 'whatsapp'
    name: string
    customer_id?: string
    external_id?: string
    business_account_id?: string
    access_token?: string
  }) {
    return this.request<{ data: Connection }>('POST', '/v1/connections', input)
  }
  updateConnection(id: string, input: { name?: string; access_token?: string }) {
    return this.request<{ data: Connection }>(
      'PATCH',
      `/v1/connections/${encode(id)}`,
      input,
    )
  }
  deleteConnection(id: string) {
    return this.request('DELETE', `/v1/connections/${encode(id)}`)
  }
  listMessages(connectionId?: string) {
    return this.request<Page<Message>>(
      'GET',
      `/v1/messages${connectionId ? `?connection_id=${encode(connectionId)}` : ''}`,
    )
  }
  sendText(connectionId: string, to: string, text: string, idempotencyKey: string) {
    return this.request<{ data: Message }>(
      'POST',
      '/v1/messages',
      {
        connection_id: connectionId,
        payload: { to, type: 'text', text: { body: text } },
      },
      idempotencyKey,
    )
  }
  listConversations() {
    return this.request<Page<Conversation>>('GET', '/v1/conversations')
  }
  updateConversation(
    id: string,
    input: { status?: 'open' | 'closed'; assigned_to?: string },
  ) {
    return this.request<{ data: Conversation }>(
      'PATCH',
      `/v1/conversations/${encode(id)}`,
      input,
    )
  }
  reply(id: string, text: string, idempotencyKey: string) {
    return this.request<{ data: Message }>(
      'POST',
      `/v1/conversations/${encode(id)}/messages`,
      { text },
      idempotencyKey,
    )
  }
  listApiKeys() {
    return this.request<Page<ApiKey>>('GET', '/v1/api_keys')
  }
  createApiKey(name: string) {
    return this.request<{ data: ApiKey }>('POST', '/v1/api_keys', { name })
  }
  revokeApiKey(id: string) {
    return this.request('DELETE', `/v1/api_keys/${encode(id)}`)
  }
  createSetupLink(customerId: string, input: SetupLinkInput = {}) {
    return this.request<{ data: SetupLink }>(
      'POST',
      `/v1/customers/${encode(customerId)}/setup_links`,
      input,
    )
  }
  listSetupLinks(customerId: string) {
    return this.request<Page<SetupLink>>(
      'GET',
      `/v1/customers/${encode(customerId)}/setup_links`,
    )
  }
  revokeSetupLink(id: string) {
    return this.request('DELETE', `/v1/setup_links/${encode(id)}`)
  }
  createWebhook(input: {
    url: string
    secret_key: string
    events: string[]
    connection_id?: string
  }) {
    return this.request<{ data: Webhook }>('POST', '/v1/webhooks', input)
  }
  deleteWebhook(id: string) {
    return this.request('DELETE', `/v1/webhooks/${encode(id)}`)
  }
}

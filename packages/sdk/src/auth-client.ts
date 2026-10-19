import { Transport } from './transport.js'
import type { ConsoleUser } from './types.js'

export class WapoAuthClient extends Transport {
  me() {
    return this.request<{ data: { user: ConsoleUser } }>('GET', '/auth/v1/me')
  }
  updateProfile(input: {
    name?: string
    email?: string
    language?: ConsoleUser['language']
    avatar_variant?: number
  }) {
    return this.request<{ data: { user: ConsoleUser } }>(
      'PATCH',
      '/auth/v1/me',
      input,
    )
  }
  login(email: string, password: string) {
    return this.request<{
      data: { token: string; expires_at: string; user: ConsoleUser }
    }>('POST', '/auth/v1/login', { email, password })
  }
  logout() {
    return this.request('POST', '/auth/v1/logout')
  }
}

import { Transport } from './transport.js'
import type { ConsoleUser, Project } from './types.js'

export class WapoAuthClient extends Transport {
  sessions() {
    return this.request<{
      data: { id: string; expires_at: string; current: boolean }[]
    }>('GET', '/auth/v1/sessions')
  }
  revokeSession(id: string) {
    return this.request('DELETE', `/auth/v1/sessions/${encodeURIComponent(id)}`)
  }
  changePassword(currentPassword: string, password: string) {
    return this.request('POST', '/auth/v1/password', {
      current_password: currentPassword,
      password,
    })
  }
  register(input: { name: string; email: string; password: string }) {
    return this.request('POST', '/auth/v1/register', input)
  }
  confirm(token: string) {
    return this.request('POST', '/auth/v1/confirm', { token })
  }
  resendConfirmation(email: string) {
    return this.request('POST', '/auth/v1/confirm/resend', { email })
  }
  recover(email: string) {
    return this.request('POST', '/auth/v1/recover', { email })
  }
  resetPassword(token: string, password: string) {
    return this.request('POST', '/auth/v1/recover/end', { token, password })
  }
  createProject(name: string) {
    return this.request<{ data: Project }>('POST', '/auth/v1/projects', {
      name,
    })
  }
  acceptProjectInvitation(token: string) {
    return this.request<{ data: { project_id: string; accepted: boolean } }>(
      'POST',
      `/auth/v1/project-invitations/${encodeURIComponent(token)}`,
    )
  }
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

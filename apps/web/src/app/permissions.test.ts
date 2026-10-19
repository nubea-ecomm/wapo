import { describe, expect, it } from 'vitest'
import { permissions } from './permissions'
import type { Session } from './session-context'

function session(role: 'admin' | 'member' | 'viewer' | 'billing', allProjects = false) {
  return {
    id: 'session',
    url: 'http://localhost:8080',
    key: 'test-session',
    role: 'operator',
    tenantId: 'project',
    tenantName: 'Project',
    user: {
      id: 'user',
      email: 'user@example.com',
      name: 'User',
      active: true,
      created_at: new Date(0).toISOString(),
      role,
      all_projects: allProjects,
      project_ids: allProjects ? [] : ['project'],
    },
  } as Session
}

describe('console permissions', () => {
  it('reserves platform administration for global administrators', () => {
    expect(permissions(session('admin', true)).canVisit('/users')).toBe(true)
    expect(permissions(session('admin')).canVisit('/users')).toBe(false)
    expect(permissions(session('member', true)).canVisit('/tenants')).toBe(false)
  })

  it('keeps API key management restricted to project administrators', () => {
    expect(permissions(session('admin')).canVisit('/api-keys')).toBe(true)
    expect(permissions(session('member')).canVisit('/api-keys')).toBe(false)
    expect(permissions(session('viewer')).canVisit('/api-keys')).toBe(false)
  })

  it('allows members to write and viewers only to read', () => {
    expect(permissions(session('member')).canWrite).toBe(true)
    expect(permissions(session('viewer')).canWrite).toBe(false)
  })

  it('limits billing users to overview and settings', () => {
    const billing = permissions(session('billing'))
    expect(billing.canVisit('/')).toBe(true)
    expect(billing.canVisit('/settings')).toBe(true)
    expect(billing.canVisit('/customers')).toBe(false)
  })
})

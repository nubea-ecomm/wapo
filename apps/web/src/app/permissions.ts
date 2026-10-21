import type { Session } from './session-context'

export function permissions(session: Session | null) {
  const role =
    (!session?.user?.all_projects &&
      session?.user?.project_roles?.[session.tenantId]) ||
    session?.user?.role ||
    'admin'
  const canManagePlatform =
    session?.role === 'operator' &&
    (session?.user?.role || 'admin') === 'admin' &&
    (session?.user?.all_projects ?? true)
  const canManageProject = role === 'admin'
  const canWrite = role === 'admin' || role === 'member'

  function canVisit(path: string) {
    if (path === '/account-security') return Boolean(session?.user)

    if (path === '/users') return canManagePlatform

    if (path === '/tenants') return session?.role === 'operator'

    if (path === '/members') return canManageProject && Boolean(session?.user)

    if (path === '/api-keys') return canManageProject

    if (role === 'billing') return ['/', '/settings'].includes(path)

    return true
  }

  return { role, canManagePlatform, canManageProject, canWrite, canVisit }
}

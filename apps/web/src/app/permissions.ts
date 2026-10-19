import type { Session } from './session-context'

export function permissions(session: Session | null) {
  const role = session?.user?.role || 'admin'
  const canManagePlatform =
    session?.role === 'operator' &&
    role === 'admin' &&
    (session?.user?.all_projects ?? true)
  const canManageProject = role === 'admin'
  const canWrite = role === 'admin' || role === 'member'

  function canVisit(path: string) {
    if (['/users', '/tenants'].includes(path)) return canManagePlatform

    if (path === '/api-keys') return canManageProject

    if (role === 'billing') return ['/', '/settings'].includes(path)

    return true
  }

  return { role, canManagePlatform, canManageProject, canWrite, canVisit }
}

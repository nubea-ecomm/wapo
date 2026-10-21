export type TeamMember = {
  id: string
  name: string
  email: string
  role: 'admin' | 'member' | 'viewer' | 'billing'
  active: boolean
  created_at?: string
  avatar_variant?: number
}

export const teamRoles = [
  ['admin', 'team.admin'],
  ['member', 'team.member'],
  ['viewer', 'team.viewer'],
  ['billing', 'team.billing'],
] as const

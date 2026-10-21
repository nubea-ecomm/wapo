import { useState } from 'react'
import { Plus, Search, UsersRound } from 'lucide-react'
import { useSession } from '../app/session-context'
import { useI18n } from '../app/i18n'
import { useApi } from '../hooks/use-api'
import {
  PageHeader,
  ErrorNotice,
  Empty,
  Loading,
  Status,
} from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { SelectField } from '../components/ui/select-field'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'
import { UserAvatar } from '../components/user-avatar'
import { InviteMemberDialog } from '../components/invite-member-dialog'
import { MemberRoleDialog } from '../components/member-role-dialog'
import { MemberActions } from '../components/member-actions'
import { dateLabel } from '../lib/message-format'
import { teamRoles, type TeamMember } from '../lib/team'

export function MembersPage() {
  const { t } = useI18n()
  const { session } = useSession()
  const members = useApi<{ data: TeamMember[] }>('/v1/members')
  const [inviting, setInviting] = useState(false)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [sent, setSent] = useState(false)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const all = members.data?.data || []
  const filtered = all.filter(
    (member) =>
      `${member.name} ${member.email}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (status === 'all' || member.active === (status === 'active')),
  )
  const activeCount = all.filter((member) => member.active).length
  const adminCount = all.filter(
    (member) => member.active && member.role === 'admin',
  ).length

  function invite() {
    setSent(false)
    setInviting(true)
  }

  return (
    <>
      <PageHeader
        title={t('team.title')}
        description={t('team.description')}
        action={
          <Button onClick={invite}>
            <Plus />
            {t('team.invite')}
          </Button>
        }
      />
      <ErrorNotice error={members.error} />
      {sent && (
        <p
          role="status"
          className="mb-4 text-sm text-muted-foreground"
        >
          {t('team.sent')}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label={t('users.search')}
            placeholder={t('users.searchPlaceholder')}
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-36">
          <SelectField
            aria-label={t('users.filterStatus')}
            value={status}
            onValueChange={setStatus}
          >
            <option value="all">{t('common.all')}</option>
            <option value="active">{t('status.active')}</option>
            <option value="inactive">{t('status.inactive')}</option>
          </SelectField>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {all.length} {t('team.members')} / {activeCount} {t('users.active')}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="pl-4">{t('users.user')}</TableHead>
              <TableHead>{t('team.memberRole')}</TableHead>
              <TableHead>{t('project')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('common.created')}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t('common.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((member) => (
              <TableRow key={member.id}>
                <TableCell className="py-3 pl-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      id={member.id}
                      name={member.name}
                      variant={member.avatar_variant}
                    />
                    <div>
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        {member.name}
                        {member.id === session?.user?.id && (
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {t('team.you')}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t(
                    teamRoles.find(([role]) => role === member.role)?.[1] ||
                      'team.member',
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {session?.tenantName}
                </TableCell>
                <TableCell>
                  <Status value={member.active ? 'active' : 'inactive'} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {member.created_at ? dateLabel(member.created_at) : '—'}
                </TableCell>
                <TableCell>
                  <MemberActions
                    member={member}
                    lastAdmin={
                      member.role === 'admin' &&
                      member.active &&
                      adminCount === 1
                    }
                    onEdit={() => setEditing(member)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {members.isLoading ? (
          <Loading variant="table" />
        ) : (
          !members.error &&
          !filtered.length && (
            <Empty
              title={all.length ? t('noResults') : t('team.empty')}
              icon={<UsersRound size={24} />}
            >
              <span>
                {t(
                  all.length
                    ? 'team.noResultsDescription'
                    : 'team.emptyDescription',
                )}
              </span>
              <br />
              {all.length ? (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    setSearch('')
                    setStatus('all')
                  }}
                >
                  {t('team.clearFilters')}
                </Button>
              ) : (
                <Button
                  className="mt-4"
                  onClick={invite}
                >
                  <Plus />
                  {t('team.invite')}
                </Button>
              )}
            </Empty>
          )
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t('team.scopeHint')}
      </p>
      {inviting && (
        <InviteMemberDialog
          onClose={() => setInviting(false)}
          onSent={() => {
            setInviting(false)
            setSent(true)
          }}
        />
      )}
      {editing && (
        <MemberRoleDialog
          member={editing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

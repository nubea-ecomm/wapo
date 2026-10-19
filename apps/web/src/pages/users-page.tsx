import { UserAccessEditor } from '../components/user-access-editor'
import { UserAvatar } from '../components/user-avatar'
import { useState } from 'react'
import type { ConsoleUser, Page, Project } from '@nubea-ecomm/wapo-sdk'
import { Plus, Search } from 'lucide-react'
import { useSession } from '../app/session-context'
import { useApi } from '../hooks/use-api'
import {
  PageHeader,
  ErrorNotice,
  Empty,
  Loading,
  Status,
} from '../components/ui'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { NativeSelect } from '../components/ui/native-select'
import { Badge } from '../components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'
import { UserEditor } from '../components/user-editor'
import { UserActions } from '../components/user-actions'
import { dateLabel } from '../lib/message-format'
import { useI18n } from '../app/i18n'

export function UsersPage() {
  const { t } = useI18n()
  const { session } = useSession()
  const [editor, setEditor] = useState<ConsoleUser | 'new' | null>(null)
  const [accessUser, setAccessUser] = useState<ConsoleUser | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const projects = useApi<Page<Project>>('/admin/v1/tenants', { admin: true })
  const users = useApi<Page<ConsoleUser>>('/admin/v1/users', { admin: true })
  const all = users.data?.data || []
  const activeCount = all.filter((user) => user.active).length
  const operatorCount = all.filter(
    (user) => user.active && user.role === 'admin' && user.all_projects,
  ).length
  const filtered = all.filter(
    (user) =>
      `${user.name} ${user.email}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (status === 'all' || user.active === (status === 'active')),
  )

  return (
    <>
      <PageHeader
        title={t('users')}
        description={t('users.description')}
        action={
          <Button onClick={() => setEditor('new')}>
            <Plus />
            {t('users.create')}
          </Button>
        }
      />
      <ErrorNotice error={users.error} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label={t('users.search')}
            placeholder={t('users.searchPlaceholder')}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-36">
          <NativeSelect
            aria-label={t('users.filterStatus')}
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">{t('common.all')}</option>
            <option value="active">{t('status.active')}</option>
            <option value="inactive">{t('status.inactive')}</option>
          </NativeSelect>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {all.length} {t('users').toLowerCase()} / {activeCount}{' '}
          {t('users.active')}
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="pl-4">{t('users.user')}</TableHead>
              <TableHead>{t('users.role')}</TableHead>
              <TableHead>{t('users.access')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('common.created')}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="py-3 pl-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      id={user.id}
                      name={user.name}
                    />
                    <div>
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        {user.name}
                        {user.id === session?.user?.id && (
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                          >
                            Vos
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {user.email}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">
                  {user.role || 'admin'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {user.all_projects
                    ? 'Todos'
                    : projects.data?.data
                        .filter((project) =>
                          user.project_ids?.includes(project.id),
                        )
                        .map((project) => project.name)
                        .join(', ') || t('users.noAccess')}
                </TableCell>
                <TableCell>
                  {user.invitation_pending ? (
                    <Badge variant="outline">
                      {t('users.invitationPending')}
                    </Badge>
                  ) : (
                    <Status value={user.active ? 'active' : 'inactive'} />
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {dateLabel(user.created_at)}
                </TableCell>
                <TableCell>
                  <UserActions
                    user={user}
                    lastActive={
                      user.active &&
                      user.role === 'admin' &&
                      user.all_projects &&
                      operatorCount === 1
                    }
                    onReset={() => setEditor(user)}
                    onAccess={() => setAccessUser(user)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {users.isLoading ? (
          <Loading variant="table" />
        ) : (
          !filtered.length && (
            <Empty title={all.length ? t('noResults') : t('users.none')}>
              {t('noResults')}
            </Empty>
          )
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {t('users.permissionsHint')}
      </p>
      {accessUser && (
        <UserAccessEditor
          user={accessUser}
          onClose={() => setAccessUser(null)}
        />
      )}
      {editor && (
        <UserEditor
          user={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  )
}

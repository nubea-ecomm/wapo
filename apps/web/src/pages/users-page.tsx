import { UserAccessEditor } from '../components/user-access-editor'
import { UserAvatar } from '../components/user-avatar'
import { useState } from 'react'
import type { ConsoleUser, Page, Project } from '@wapo/sdk'
import { Plus, Search } from 'lucide-react'
import { useSession } from '../app/session-context'
import { useApi } from '../hooks/use-api'
import { PageHeader, ErrorNotice, Empty, Loading } from '../components/ui'
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
export function UsersPage() {
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
      `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()) &&
      (status === 'all' || user.active === (status === 'active')),
  )
  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Gestioná el acceso a la consola."
        action={
          <Button onClick={() => setEditor('new')}>
            <Plus />
            Crear usuario
          </Button>
        }
      />
      <ErrorNotice error={users.error} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Buscar usuarios"
            placeholder="Buscar por nombre o email…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="w-36">
          <NativeSelect
            aria-label="Filtrar por estado"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </NativeSelect>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {all.length} usuarios / {activeCount} activos
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="pl-4">Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Proyectos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Creado</TableHead>
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
                    <UserAvatar id={user.id} name={user.name} />
                    <div>
                      <div className="flex items-center gap-2 font-medium text-foreground">
                        {user.name}
                        {user.id === session?.user?.id && (
                          <Badge variant="secondary" className="text-[10px]">
                            Vos
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">{user.email}</span>
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
                        .filter((project) => user.project_ids?.includes(project.id))
                        .map((project) => project.name)
                        .join(', ') || 'Sin acceso'}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      user.active
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'bg-muted/50 text-muted-foreground'
                    }
                  >
                    <span className="size-1.5 rounded-full bg-current" />
                    {user.active ? 'Activo' : 'Inactivo'}
                  </Badge>
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
            <Empty title={all.length ? 'Sin resultados' : 'Sin usuarios'}>
              Probá con otro nombre o filtro.
            </Empty>
          )
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Los permisos se aplican a los proyectos asignados.
      </p>
      {accessUser && (
        <UserAccessEditor user={accessUser} onClose={() => setAccessUser(null)} />
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

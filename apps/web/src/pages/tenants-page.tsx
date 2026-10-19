import { ProjectAvatar } from '../components/project-avatar'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import type { Page, Project } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useApi } from '../hooks/use-api'
import { PageHeader, ErrorNotice, Empty, Loading, Status } from '../components/ui'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { NativeSelect } from '../components/ui/native-select'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'
import { TenantEditor } from '../components/tenant-editor'
import { TenantActions } from '../components/tenant-actions'
import { dateLabel } from '../lib/message-format'
export function TenantsPage() {
  const { session, selectTenant } = useSession()
  const navigate = useNavigate()
  const [editor, setEditor] = useState<Project | 'new' | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const tenants = useApi<Page<Project>>('/admin/v1/tenants', {
    admin: true,
    enabled: session?.role === 'operator',
  })
  const all = tenants.data?.data || []
  const filtered = all.filter(
    (tenant) =>
      `${tenant.name} ${tenant.id}`.toLowerCase().includes(search.toLowerCase()) &&
      (status === 'all' || status === tenant.status),
  )
  function openTenant(tenant: Project) {
    selectTenant(tenant.id, tenant.name)
    navigate('/')
  }
  if (session?.role !== 'operator')
    return <Empty title="Acceso de administrador requerido" />
  return (
    <>
      <PageHeader
        title="Proyectos"
        description="Administrá tus proyectos."
        action={
          <Button onClick={() => setEditor('new')}>
            <Plus />
            Nuevo proyecto
          </Button>
        }
      />
      <ErrorNotice error={tenants.error} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            aria-label="Buscar proyectos"
            placeholder="Buscar por nombre o ID…"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-40">
          <NativeSelect
            aria-label="Filtrar proyectos por estado"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="suspended">Suspendidos</option>
          </NativeSelect>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {all.length} proyectos /{' '}
          {all.filter((tenant) => tenant.status === 'active').length} activos
        </span>
      </div>
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="pl-4">Proyecto</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Claves activas</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((tenant) => (
              <TableRow key={tenant.id}>
                <TableCell className="py-3 pl-4">
                  <div className="flex items-center gap-3">
                    <ProjectAvatar name={tenant.name} logoUrl={tenant.logo_url} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          className="text-left text-sm font-medium text-foreground hover:underline disabled:no-underline"
                          disabled={tenant.status !== 'active'}
                          onClick={() => openTenant(tenant)}
                        >
                          {tenant.name}
                        </button>
                        {session?.tenantId === tenant.id && (
                          <Badge variant="secondary" className="text-[10px]">
                            Actual
                          </Badge>
                        )}
                      </div>
                      <code className="text-[11px] text-muted-foreground">
                        {tenant.id}
                      </code>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Status value={tenant.status} />
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {tenant.active_keys ?? 0}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {dateLabel(tenant.created_at)}
                </TableCell>
                <TableCell>
                  <TenantActions
                    tenant={tenant}
                    onOpen={() => openTenant(tenant)}
                    onRename={() => setEditor(tenant)}
                    onConfigure={() => {
                      selectTenant(tenant.id, tenant.name)
                      navigate('/settings')
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {tenants.isLoading ? (
          <Loading variant="table" />
        ) : (
          !filtered.length && (
            <Empty title={all.length ? 'Sin resultados' : 'Creá tu primer proyecto'}>
              {all.length
                ? 'Probá con otro nombre o filtro.'
                : 'Cada proyecto tiene sus propias conexiones y claves de API.'}
            </Empty>
          )
        )}
      </div>
      {editor && (
        <TenantEditor
          key={editor === 'new' ? 'new' : editor.id}
          tenant={editor === 'new' ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}
    </>
  )
}

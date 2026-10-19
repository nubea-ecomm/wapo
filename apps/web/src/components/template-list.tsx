import { TemplateHistory } from './template-history'
import { useState } from 'react'
import type { Connection, MessageTemplate } from '@wapo/sdk'
import { Plus, RefreshCw, Search } from 'lucide-react'
import { useSession } from '../app/session-context'
import { permissions } from '../app/permissions'
import { usePaged } from '../hooks/use-paged'
import { Panel, Loading, Empty, ErrorNotice, LoadMore } from './ui'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'
import { Badge } from './ui/badge'
import { Table, TableHeader, TableBody, TableHead, TableCell, TableRow } from './ui/table'
import { FormDialog } from './form-dialog'
import { CopyCode } from './copy-code'
import { TemplateEditor } from './template-editor'
import { CredentialRecovery } from './credential-recovery'
import { isCredentialExpired } from '../lib/api-error'
export function TemplateList({
  connection,
  connectionId,
  customerId,
}: {
  connection: Connection
  connectionId: string
  customerId?: string
}) {
  const { session } = useSession()
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<MessageTemplate | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const params = new URLSearchParams()
  if (customerId) params.set('connection_id', connectionId)
  if (status) params.set('status', status)
  const templates = usePaged<MessageTemplate>(
    `/v1/${customerId ? 'customers' : 'connections'}/${encodeURIComponent(customerId || connectionId)}/templates${params.size ? `?${params}` : ''}`,
  )
  const filtered = templates.items.filter((template) =>
    `${template.name} ${template.language}`.toLowerCase().includes(search.toLowerCase()),
  )
  const credentialExpired = isCredentialExpired(templates.error)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Los templates se comparten entre los números de la misma cuenta de WhatsApp.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Actualizar templates"
            disabled={templates.isFetching}
            onClick={() => void templates.refetch()}
          >
            <RefreshCw className={templates.isFetching ? 'animate-spin' : ''} />
          </Button>
          {permissions(session).canWrite && (
            <Button
              size="sm"
              disabled={credentialExpired}
              onClick={() => setCreating(true)}
            >
              <Plus />
              Crear template
            </Button>
          )}
        </div>
      </div>
      <Panel
        title="Templates"
        action={
          <div className="flex flex-wrap gap-2">
            <div className="search-input">
              <Search className="size-4" />
              <Input
                aria-label="Buscar templates"
                placeholder="Buscar template…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="w-36">
              <NativeSelect
                aria-label="Estado de templates"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">Todos</option>
                <option value="APPROVED">Aprobados</option>
                <option value="PENDING">En revisión</option>
                <option value="REJECTED">Rechazados</option>
                <option value="PAUSED">Pausados</option>
                <option value="DISABLED">Deshabilitados</option>
              </NativeSelect>
            </div>
          </div>
        }
      >
        <ErrorNotice error={credentialExpired ? null : templates.error} />
        {credentialExpired && <CredentialRecovery connection={connection} />}
        {templates.isLoading && <Loading variant="table" />}
        {filtered.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Idioma</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((template) => (
                <TableRow key={`${template.id}:${template.language}`}>
                  <TableCell>
                    <button
                      className="font-medium text-foreground hover:underline"
                      onClick={() => setSelected(template)}
                    >
                      {template.name}
                    </button>
                  </TableCell>
                  <TableCell>{template.language}</TableCell>
                  <TableCell>{template.category}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {(
                        {
                          APPROVED: 'Aprobado',
                          PENDING: 'En revisión',
                          REJECTED: 'Rechazado',
                          PAUSED: 'Pausado',
                          DISABLED: 'Deshabilitado',
                        } as Record<string, string>
                      )[template.status] || template.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!templates.isLoading && !templates.error && !filtered.length && (
          <Empty title="Sin templates">
            {search ? 'Probá con otro nombre.' : 'Creá un template o revisá otra cuenta.'}
          </Empty>
        )}
      </Panel>
      <LoadMore
        available={templates.hasNextPage}
        busy={templates.isFetchingNextPage}
        load={() => void templates.fetchNextPage()}
      />
      {creating && (
        <TemplateEditor connectionId={connectionId} onClose={() => setCreating(false)} />
      )}
      {selected && (
        <FormDialog
          title={selected.name}
          description={`${selected.language} / ${selected.status}`}
          onClose={() => setSelected(null)}
        >
          <div className="grid gap-3">
            {selected.components.map(
              (component, index) =>
                typeof component.text === 'string' && (
                  <p
                    key={index}
                    className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap"
                  >
                    {component.text}
                  </p>
                ),
            )}
            {selected.rejected_reason && (
              <p className="text-sm text-destructive">{selected.rejected_reason}</p>
            )}
            <TemplateHistory connectionId={connectionId} templateId={selected.id} />
            <details>
              <summary className="cursor-pointer text-xs">Ver JSON</summary>
              <CopyCode value={JSON.stringify(selected, null, 2)} />
            </details>
          </div>
        </FormDialog>
      )}
    </>
  )
}

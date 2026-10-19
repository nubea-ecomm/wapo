import { TemplateHistory } from './template-history'
import { useState } from 'react'
import type { Connection, MessageTemplate } from '@wapo/sdk'
import { Plus, RefreshCw, Search, Send } from 'lucide-react'
import { useSession } from '../app/session-context'
import { permissions } from '../app/permissions'
import { usePaged } from '../hooks/use-paged'
import { Panel, Loading, Empty, ErrorNotice, LoadMore, Status } from './ui'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableCell,
  TableRow,
} from './ui/table'
import { FormDialog } from './form-dialog'
import { CopyCode } from './copy-code'
import { TemplateEditor } from './template-editor'
import { CredentialRecovery } from './credential-recovery'
import { isCredentialExpired } from '../lib/api-error'
import { TemplateSendDialog } from './template-send-dialog'
import { templatePreview } from '../lib/template-message'
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
  const [testing, setTesting] = useState<MessageTemplate | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const params = new URLSearchParams()
  if (customerId) params.set('connection_id', connectionId)
  if (status) params.set('status', status)
  const templates = usePaged<MessageTemplate>(
    `/v1/${customerId ? 'customers' : 'connections'}/${encodeURIComponent(customerId || connectionId)}/templates${params.size ? `?${params}` : ''}`,
  )
  const filtered = templates.items.filter((template) =>
    `${template.name} ${template.language}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )
  const credentialExpired = isCredentialExpired(templates.error)
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Los templates se comparten entre los números de la misma cuenta de
          WhatsApp.
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
          <div className="table-scroll">
            <Table className="min-w-[720px] table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[42%]">Nombre</TableHead>
                  <TableHead className="w-[15%]">Idioma</TableHead>
                  <TableHead className="w-[18%]">Categoría</TableHead>
                  <TableHead className="w-[17%]">Estado</TableHead>
                  <TableHead className="w-[8%] text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
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
                      <Status
                        value={template.status}
                        label={
                          (
                            {
                              APPROVED: 'Aprobado',
                              PENDING: 'En revisión',
                              REJECTED: 'Rechazado',
                              PAUSED: 'Pausado',
                              DISABLED: 'Deshabilitado',
                            } as Record<string, string>
                          )[template.status]
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {template.status === 'APPROVED' &&
                        permissions(session).canWrite && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Probar ${template.name}`}
                            onClick={() => setTesting(template)}
                          >
                            <Send />
                          </Button>
                        )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {!templates.isLoading && !templates.error && !filtered.length && (
          <Empty title="Sin templates">
            {search
              ? 'Probá con otro nombre.'
              : 'Creá un template o revisá otra cuenta.'}
          </Empty>
        )}
      </Panel>
      <LoadMore
        available={templates.hasNextPage}
        busy={templates.isFetchingNextPage}
        load={() => void templates.fetchNextPage()}
      />
      {creating && (
        <TemplateEditor
          connectionId={connectionId}
          onClose={() => setCreating(false)}
        />
      )}
      {selected && (
        <FormDialog
          title={
            <span className="flex items-center gap-3 pr-8">
              <span className="truncate">{selected.name}</span>
              <Status value={selected.status} />
            </span>
          }
          description={`${selected.language} · ${selected.category}`}
          contentClassName="sm:max-w-2xl"
          onClose={() => setSelected(null)}
        >
          <div className="grid gap-5">
            <section>
              <h3 className="mb-2 text-xs font-medium text-muted-foreground">
                Vista previa
              </h3>
              <div className="max-w-lg rounded-xl rounded-tl-sm border bg-emerald-50 p-4 text-sm text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-50">
                {templatePreview(selected, {}).map((part, index) =>
                  part.type === 'header' ? (
                    <strong
                      className="mb-2 block"
                      key={index}
                    >
                      {part.text}
                    </strong>
                  ) : part.type === 'footer' ? (
                    <small
                      className="mt-3 block opacity-65"
                      key={index}
                    >
                      {part.text}
                    </small>
                  ) : (
                    <p
                      className="whitespace-pre-wrap"
                      key={index}
                    >
                      {part.text}
                    </p>
                  ),
                )}
              </div>
            </section>
            {selected.rejected_reason &&
              selected.rejected_reason !== 'NONE' && (
                <p className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                  {selected.rejected_reason}
                </p>
              )}
            <TemplateHistory
              connectionId={connectionId}
              templateId={selected.id}
            />
            <details className="border-t pt-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Ver definición JSON
              </summary>
              <CopyCode value={JSON.stringify(selected, null, 2)} />
            </details>
            {selected.status === 'APPROVED' &&
              permissions(session).canWrite && (
                <div className="flex justify-end border-t pt-4">
                  <Button
                    onClick={() => {
                      setSelected(null)
                      setTesting(selected)
                    }}
                  >
                    <Send /> Probar template
                  </Button>
                </div>
              )}
          </div>
        </FormDialog>
      )}
      {testing && (
        <TemplateSendDialog
          connection={connection}
          template={testing}
          title="Probar template"
          onClose={() => setTesting(null)}
        />
      )}
    </>
  )
}

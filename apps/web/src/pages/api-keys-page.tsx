import { ResourceActions } from '../components/resource-actions'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'
import { useState } from 'react'
import type { ApiKey, Page } from '@wapo/sdk'
import { Copy, KeyRound, Check } from 'lucide-react'
import { useSession } from '../app/session-context'
import { useApi, useAction } from '../hooks/use-api'
import {
  PageHeader,
  Panel,
  Field,
  ErrorNotice,
  Empty,
  Status,
  Loading,
} from '../components/ui'
import { dateLabel } from '../lib/message-format'
export function ApiKeysPage() {
  const { client, session } = useSession()
  const [name, setName] = useState('')
  const [revealed, setRevealed] = useState('')
  const [copied, setCopied] = useState(false)
  const keys = useApi<Page<ApiKey>>('/v1/api_keys')
  const create = useAction(async () => {
    const result = await client.createApiKey(name)
    setRevealed(result.data.key || '')
    setName('')
    setCopied(false)
  })
  const revoke = useAction((id: string) => client.revokeApiKey(id))
  return (
    <>
      <PageHeader title="API keys" description="Claves de acceso a la API." />
      <Panel title="Nueva clave de API">
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <Field label="Nombre de la integración">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="Backend de producción"
            />
          </Field>
          <Button
            variant="default"
            size="default"

            disabled={!session?.tenantId || create.isPending}
          >
            <KeyRound size={15} /> {create.isPending ? 'Creando…' : 'Crear clave'}
          </Button>
        </form>
        <ErrorNotice error={create.error} />
        {revealed && (
          <div className="secret-result">
            <b>Guardá esta clave. Solo se muestra una vez.</b>
            <div>
              <code>{revealed}</code>
              <Button
                variant="ghost"
                size="icon-sm"

                aria-label="Copiar clave"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(revealed)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false))
                }}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </Button>
            </div>
            <Button variant="link" size="default" onClick={() => setRevealed('')}>
              Ocultar clave
            </Button>
          </div>
        )}
      </Panel>
      <Panel className="resource-table" title="Claves del proyecto">
        <ErrorNotice error={keys.error || revoke.error} />
        {keys.isLoading && <Loading variant="table" />}
        {keys.data?.data.length ? (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Prefijo</TableHead>
                  <TableHead>Creación</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.data.data.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell>
                      <b>{k.name}</b>
                    </TableCell>
                    <TableCell>
                      <code>{k.prefix || 'bootstrap'}…</code>
                    </TableCell>
                    <TableCell>{dateLabel(k.created_at)}</TableCell>
                    <TableCell>
                      <Status
                        value={k.revoked_at ? 'revoked' : 'active'}
                        label={k.revoked_at ? 'Revocada' : undefined}
                      />
                    </TableCell>
                    <TableCell>
                      {!k.revoked_at && (
                        <ResourceActions
                          name={k.name}
                          destructive={{
                            label: 'Revocar clave',
                            description:
                              'Las integraciones que usen esta clave perderán acceso inmediatamente.',
                            disabled: revoke.isPending,
                            onConfirm: async () => {
                              await revoke.mutateAsync(k.id)
                              await keys.refetch()
                            },
                          }}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          !keys.isLoading &&
          !keys.error && (
            <Empty title="Sin claves para mostrar">
              Seleccioná un proyecto y creá una credencial para su API.
            </Empty>
          )
        )}
      </Panel>
      <p className="hint">
        Cada clave tiene acceso completo a un proyecto. Las claves de proyecto no pueden
        administrar otros proyectos.
      </p>
    </>
  )
}

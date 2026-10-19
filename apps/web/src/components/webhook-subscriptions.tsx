import type { Webhook } from '@wapo/sdk'
import { Webhook as WebhookIcon } from 'lucide-react'
import { Panel, Empty, Status } from './ui'
import { ResourceActions } from './resource-actions'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from './ui/table'

export function WebhookSubscriptions({
  hooks,
  busy,
  onDelete,
}: {
  hooks: Webhook[]
  busy: boolean
  onDelete: (id: string) => Promise<unknown>
}) {
  return (
    <Panel title="Suscripciones">
      {hooks.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Destino</TableHead>
              <TableHead>Eventos</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {hooks.map((h) => (
              <TableRow key={h.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="resource-avatar">
                      <WebhookIcon className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <span
                        className="block max-w-80 truncate font-medium text-foreground"
                        title={h.url}
                      >
                        {h.url}
                      </span>
                      <small>
                        {h.connection_id
                          ? 'Conexión específica'
                          : 'Todo el proyecto'}
                      </small>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex max-w-72 flex-wrap gap-1">
                    {h.events.map((event) => (
                      <code
                        className="rounded border bg-muted px-1.5 py-0.5"
                        key={event}
                      >
                        {event}
                      </code>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Status value={h.active ? 'active' : 'inactive'} />
                </TableCell>
                <TableCell>
                  <ResourceActions
                    name={h.url}
                    destructive={{
                      label: 'Eliminar webhook',
                      description:
                        'Las entregas pendientes de esta suscripción se cancelarán.',
                      disabled: busy,
                      onConfirm: () => onDelete(h.id),
                    }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty title="Sin suscripciones">
          Agregá un webhook para recibir eventos en tu backend.
        </Empty>
      )}
    </Panel>
  )
}

import { WebhookSubscriptions } from '../components/webhook-subscriptions'
import { Button } from '../components/ui/button'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table'
import { usePaged } from '../hooks/use-paged'
import { LoadMore } from '../components/ui'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { Webhook, Page } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useApi, useAction } from '../hooks/use-api'
import {
  PageHeader,
  Panel,
  Status,
  Empty,
  Loading,
  ErrorNotice,
  ConfirmButton,
} from '../components/ui'
import { WebhookEditor } from '../components/webhook-editor'
interface Delivery {
  id: string
  event: string
  state: string
  attempts: number
  last_status?: number
  subscription_id: string
}
export function WebhooksPage() {
  const { client, session } = useSession()
  const [creating, setCreating] = useState(false)
  const hooks = usePaged<Webhook>('/v1/webhooks')
  const deliveries = useApi<Page<Delivery>>('/v1/deliveries', { poll: true })
  const remove = useAction((id: string) => client.deleteWebhook(id))
  const retry = useAction((id: string) =>
    client.request('POST', `/v1/deliveries/${encodeURIComponent(id)}/retry`),
  )
  return (
    <>
      <PageHeader
        title="Webhooks"
        description="Suscripciones y entregas de eventos."
        action={
          <Button
            variant="default"
            size="default"

            disabled={!session?.tenantId}
            onClick={() => setCreating(true)}
          >
            <Plus size={15} /> Nuevo webhook
          </Button>
        }
      />
      <ErrorNotice error={hooks.error || remove.error} />
      {hooks.isLoading && <Loading variant="table" />}
      {!hooks.isLoading && (
        <WebhookSubscriptions
          hooks={hooks.items}
          busy={remove.isPending}
          onDelete={(id) => remove.mutateAsync(id)}
        />
      )}
      <Panel className="resource-table" title="Entregas recientes">
        <ErrorNotice error={deliveries.error || retry.error} />
        {deliveries.isLoading ? (
          <Loading variant="table" />
        ) : deliveries.error ? null : deliveries.data?.data.length ? (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Intentos</TableHead>
                  <TableHead>HTTP</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.data.data.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <b>{d.event}</b>
                      <small className="mono">{d.id}</small>
                    </TableCell>
                    <TableCell>
                      <Status value={d.state} />
                    </TableCell>
                    <TableCell>{d.attempts}</TableCell>
                    <TableCell>{d.last_status || '-'}</TableCell>
                    <TableCell>
                      {d.state === 'failed' && (
                        <ConfirmButton
                          disabled={retry.isPending}
                          message="¿Reintentar esta entrega? El receptor debe deduplicar el evento para evitar efectos repetidos."
                          onConfirm={() => retry.mutateAsync(d.id)}
                        >
                          Reintentar
                        </ConfirmButton>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <Empty title="Sin entregas todavía">
            Las entregas aparecerán cuando haya eventos que coincidan con tus
            suscripciones.
          </Empty>
        )}
      </Panel>
      <p className="hint">
        Validá X-Webhook-Signature sobre los bytes originales y deduplicá por
        X-Idempotency-Key.
      </p>
      <LoadMore
        available={hooks.hasNextPage}
        busy={hooks.isFetchingNextPage}
        load={() => {
          void hooks.fetchNextPage()
        }}
      />
      {creating && <WebhookEditor onClose={() => setCreating(false)} />}
    </>
  )
}

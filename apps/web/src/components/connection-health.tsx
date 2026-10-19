import { useState } from 'react'
import { SetupLinkResult } from './setup-link-result'
import {
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import { useSession } from '../app/session-context'
import { permissions } from '../app/permissions'
import { useApi, useAction } from '../hooks/use-api'
import { Panel, Loading, ErrorNotice } from './ui'
import { Button } from './ui/button'
import { dateLabel } from '../lib/message-format'
interface Check {
  id: string
  label: string
  status: 'pass' | 'fail' | 'unknown' | 'warning'
  message: string
  provider_error?: { code?: number; message?: string }
  possible_solution?: string
  manage_url?: string
}
interface Health {
  status: string
  checked_at: string
  checks: Check[]
  issues: number
  quality_rating?: string
  billing: { status: string; manage_url: string }
}
export function ConnectionHealth({
  id,
  customerId,
  phoneNumberId,
}: {
  id: string
  customerId?: string
  phoneNumberId?: string
}) {
  const { client, session } = useSession()
  const health = useApi<{ data: Health }>(
    `/v1/connections/${encodeURIComponent(id)}/health`,
  )
  const run = useAction(() =>
    client.request('POST', `/v1/connections/${encodeURIComponent(id)}/health`),
  )
  const [reconnectUrl, setReconnectUrl] = useState('')
  const reconnect = useAction(async () => {
    if (!customerId || !phoneNumberId)
      throw new Error('Esta conexión no tiene un customer asociado.')
    const result = await client.createSetupLink(customerId, {
      reconnect_phone_number: phoneNumberId,
      language: 'es',
    })
    setReconnectUrl(result.data.url || '')
  })
  const d = health.data?.data
  return (
    <Panel
      title="Diagnóstico"
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={
            run.isPending || health.isFetching || !permissions(session).canWrite
          }
          onClick={() => run.mutate()}
        >
          <RefreshCw className={run.isPending ? 'animate-spin' : ''} />
          {run.isPending ? 'Comprobando…' : 'Comprobar ahora'}
        </Button>
      }
    >
      <ErrorNotice error={health.error || run.error || reconnect.error} />
      {health.isLoading && <Loading variant="settings" />}
      {d && (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              Última comprobación: {dateLabel(d.checked_at)}
            </span>
            <span>
              {d.issues
                ? `${d.issues} ${d.issues === 1 ? 'problema detectado' : 'problemas detectados'}`
                : d.status === 'healthy'
                  ? 'Comprobaciones correctas'
                  : 'Hay datos sin confirmar'}
            </span>
          </div>
          <div className="divide-y">
            {d.checks.map((check) => {
              const Icon =
                check.status === 'pass'
                  ? CheckCircle2
                  : check.status === 'fail'
                    ? XCircle
                    : AlertCircle
              return (
                <div
                  key={check.id}
                  className="flex gap-3 py-4"
                >
                  <Icon
                    className={`mt-0.5 size-4 shrink-0 ${check.status === 'pass' ? 'text-emerald-600 dark:text-emerald-400' : check.status === 'fail' ? 'text-red-600 dark:text-red-400' : check.status === 'warning' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap justify-between gap-2">
                      <h3 className="text-sm font-medium">{check.label}</h3>
                      <span className="text-xs text-muted-foreground">
                        {
                          {
                            pass: 'Correcto',
                            fail: 'Problema',
                            warning: 'Revisar',
                            unknown: 'Sin confirmar',
                          }[check.status]
                        }
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {check.message}
                    </p>
                    {check.possible_solution && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {check.possible_solution}
                      </p>
                    )}
                    {check.provider_error?.message && (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer text-muted-foreground">
                          Detalle de Meta
                        </summary>
                        <p className="mt-2 break-words text-muted-foreground">
                          {check.provider_error.code}:{' '}
                          {check.provider_error.message}
                        </p>
                      </details>
                    )}
                    {check.manage_url && (
                      <a
                        className="mt-2 inline-flex items-center gap-1 text-xs underline"
                        href={check.manage_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Revisar en Meta
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div className="text-xs">
              <p className="font-medium">Pagos de WhatsApp</p>
              <p className="mt-1 text-muted-foreground">
                {d.billing.status === 'attention_required'
                  ? 'Meta reportó un problema de pagos.'
                  : 'Estado de pagos sin confirmar. Revisá la cuenta en Meta.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <a
                href={d.billing.manage_url}
                target="_blank"
                rel="noreferrer"
              >
                Administrar en Meta
                <ExternalLink />
              </a>
            </Button>
          </div>
          {customerId &&
            phoneNumberId &&
            permissions(session).canWrite &&
            d.checks.some(
              (check) =>
                check.status === 'fail' &&
                [
                  'access_token',
                  'phone_access',
                  'webhook_subscription',
                ].includes(check.id),
            ) && (
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={reconnect.isPending}
                  onClick={() => reconnect.mutate()}
                >
                  {reconnect.isPending
                    ? 'Generando…'
                    : 'Generar enlace de reconexión'}
                </Button>
              </div>
            )}
          {reconnectUrl && (
            <div className="mt-4">
              <SetupLinkResult url={reconnectUrl} />
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

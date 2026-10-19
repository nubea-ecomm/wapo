import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, RefreshCw } from 'lucide-react'
import type { Connection } from '@wapo/sdk'
import { permissions } from '../app/permissions'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { SetupLinkResult } from './setup-link-result'
import { Button } from './ui/button'

export function CredentialRecovery({ connection }: { connection: Connection }) {
  const { client, session } = useSession()
  const [url, setURL] = useState('')
  const reconnect = useAction(async () => {
    if (!connection.customer_id || !connection.external_id) {
      throw new Error('La conexión no tiene un customer y número asociados.')
    }

    const result = await client.createSetupLink(connection.customer_id, {
      reconnect_phone_number: connection.external_id,
      language: 'es',
    })

    setURL(result.data.url || '')
  })

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">
            La autorización de Meta venció
          </h3>
          <p className="mt-1 text-xs leading-relaxed opacity-80">
            Meta no permite renovar una credencial que ya expiró. El titular
            debe autorizar nuevamente la cuenta; la conexión y su historial se
            conservan.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {connection.customer_id &&
            connection.external_id &&
            permissions(session).canWrite ? (
              <Button
                size="sm"
                disabled={reconnect.isPending}
                onClick={() => reconnect.mutate()}
              >
                <RefreshCw
                  className={reconnect.isPending ? 'animate-spin' : ''}
                />
                {reconnect.isPending
                  ? 'Generando enlace…'
                  : 'Reconectar WhatsApp'}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                asChild
              >
                <Link
                  to={`/connections/${encodeURIComponent(connection.id)}?tab=health`}
                >
                  Ver diagnóstico
                </Link>
              </Button>
            )}
          </div>
          {reconnect.error && (
            <p className="mt-3 text-xs">
              No pudimos generar el enlace. Revisá la configuración de Meta e
              intentá de nuevo.
            </p>
          )}
        </div>
      </div>
      {url && (
        <div className="mt-4 text-foreground">
          <SetupLinkResult url={url} />
        </div>
      )}
    </div>
  )
}

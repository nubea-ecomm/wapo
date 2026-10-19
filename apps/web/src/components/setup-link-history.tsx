import { useEffect, useState } from 'react'
import type { SetupLink } from '@wapo/sdk'
import { ConfirmButton, Status } from './ui'
import { dateLabel } from '../lib/message-format'

export function SetupLinkHistory({
  links,
  busy,
  onRevoke,
}: {
  links: SetupLink[]
  busy: boolean
  onRevoke: (id: string) => Promise<unknown>
}) {
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <>
      {' '}
      {!!links.length && (
        <details className="border-t pt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Enlaces anteriores ({links.length})
          </summary>
          {links.map((item) => {
            const active =
              item.status === 'active' && Date.parse(item.expires_at) > now
            const visibleStatus =
              item.status === 'completed' || item.status === 'used'
                ? 'completed'
                : item.status === 'revoked'
                  ? 'revoked'
                  : active
                    ? 'active'
                    : 'expired'

            return (
              <div
                className="flex items-center gap-3 border-b py-3 last:border-0"
                key={item.id}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">
                    {item.allowed_connection_types.length === 2
                      ? 'A elección del cliente'
                      : item.allowed_connection_types[0] === 'coexistence'
                        ? 'WhatsApp Business + API'
                        : 'Solo API'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Vence {dateLabel(item.expires_at)}
                  </p>
                </div>
                <Status value={visibleStatus} />
                {active && (
                  <ConfirmButton
                    message="¿Revocar este enlace de conexión?"
                    disabled={busy}
                    onConfirm={() => onRevoke(item.id)}
                  >
                    Revocar
                  </ConfirmButton>
                )}
              </div>
            )
          })}
        </details>
      )}
    </>
  )
}

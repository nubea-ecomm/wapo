import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle } from 'lucide-react'
import type { Connection } from '@nubea-ecomm/wapo-sdk'
import { useI18n } from '../app/i18n'
import { Button } from './ui/button'
import { Panel, Status } from './ui'
import { WhatsAppIcon } from './icons/whatsapp-icon'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table'
import { connectionTypeKey } from './connection-display'

export function ConnectionsTable({
  connections,
  customerNames,
  actions,
}: {
  connections: Connection[]
  customerNames: Map<string, string>
  actions: (connection: Connection) => ReactNode
}) {
  const { t } = useI18n()

  return (
    <Panel
      title={t('connections.whatsapp')}
      className="resource-table"
    >
      <div className="table-scroll">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('connections.connection')}</TableHead>
              <TableHead>{t('common.status')}</TableHead>
              <TableHead>{t('connections.customer')}</TableHead>
              <TableHead>{t('connections.number')}</TableHead>
              <TableHead>{t('connections.health')}</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">{t('common.actions')}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {connections.map((connection) => (
              <TableRow key={connection.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="channel-avatar whatsapp size-9">
                      <WhatsAppIcon size={18} />
                    </span>
                    <div>
                      <Link
                        className="resource-name"
                        to={`/connections/${encodeURIComponent(connection.id)}`}
                      >
                        {connection.name ||
                          connection.display_phone_number ||
                          'WhatsApp'}
                      </Link>
                      <small>{t(connectionTypeKey(connection))}</small>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <Status value={connection.status} />
                    {connection.credential_status === 'expired' && (
                      <Status value="credential_expired" />
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {customerNames.get(connection.customer_id || '') ||
                    t('connections.project')}
                </TableCell>
                <TableCell>
                  <span className="whitespace-nowrap">
                    {connection.display_phone_number ||
                      connection.external_id ||
                      '—'}
                  </span>
                </TableCell>
                <TableCell>
                  <ConnectionHealthStatus connection={connection} />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      asChild
                    >
                      <Link
                        aria-label={`${t('connections.viewChats')} ${connection.name || 'WhatsApp'}`}
                        to={`/inbox?connection=${encodeURIComponent(connection.id)}`}
                      >
                        <MessageCircle />
                      </Link>
                    </Button>
                    {actions(connection)}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Panel>
  )
}

function ConnectionHealthStatus({ connection }: { connection: Connection }) {
  const { t } = useI18n()

  if (connection.credential_status === 'expired')
    return <Status value="credential_expired" />

  if (connection.health_status)
    return <Status value={connection.health_status} />

  return (
    <span className="text-xs text-muted-foreground">
      {t('common.notChecked')}
    </span>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Pencil } from 'lucide-react'
import type { Connection } from '@nubea-ecomm/wapo-sdk'
import { useI18n } from '../app/i18n'
import { Button } from './ui/button'
import { Status } from './ui'
import { WhatsAppIcon } from './icons/whatsapp-icon'
import { compactID, connectionTypeKey } from './connection-display'

export function ConnectionCards({
  connections,
  customerNames,
  canWrite,
  onEdit,
  actions,
}: {
  connections: Connection[]
  customerNames: Map<string, string>
  canWrite: boolean
  onEdit: (connection: Connection) => void
  actions: (connection: Connection) => ReactNode
}) {
  const { t } = useI18n()

  return (
    <div className="connection-grid">
      {connections.map((connection) => {
        const title =
          connection.name || connection.display_phone_number || 'WhatsApp'
        const customer =
          customerNames.get(connection.customer_id || '') ||
          t('connections.project')

        return (
          <article
            className="connection-card"
            key={connection.id}
          >
            <div className="connection-card-header">
              <div className="flex min-w-0 items-center gap-3">
                <span className="channel-avatar whatsapp size-10">
                  <WhatsAppIcon size={21} />
                </span>
                <div className="min-w-0">
                  <Link
                    className="block truncate text-sm font-semibold hover:underline"
                    to={`/connections/${encodeURIComponent(connection.id)}`}
                  >
                    {title}
                  </Link>
                  <p className="mt-0.5 truncate">
                    {t(connectionTypeKey(connection))}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Status value={connection.status} />
                {actions(connection)}
              </div>
            </div>
            <div className="connection-card-body">
              {connection.credential_status === 'expired' && (
                <Link
                  className="connection-alert danger"
                  to={`/connections/${encodeURIComponent(connection.id)}?tab=health`}
                >
                  <span>{t('connections.tokenExpired')}</span>
                  <span>{t('connections.renew')} →</span>
                </Link>
              )}
              {connection.credential_status !== 'expired' &&
                (connection.health_status === 'error' ||
                  connection.health_status === 'warning') && (
                  <Link
                    className={`connection-alert ${connection.health_status === 'error' ? 'danger' : 'warning'}`}
                    to={`/connections/${encodeURIComponent(connection.id)}?tab=health`}
                  >
                    <span>
                      {connection.health_issues || 1}{' '}
                      {connection.health_issues === 1
                        ? t('connections.issue')
                        : t('connections.issues')}
                    </span>
                    <span>{t('connections.review')} →</span>
                  </Link>
                )}
              <div className="connection-summary">
                <div>
                  <span>{t('connections.customer')}</span>
                  <strong title={customer}>{customer}</strong>
                </div>
                <div>
                  <span>{t('connections.number')}</span>
                  <strong>
                    {connection.display_phone_number ||
                      connection.external_id ||
                      t('connections.noNumber')}
                  </strong>
                </div>
              </div>
              <div className="connection-identifiers">
                <div>
                  <span>{t('connections.phoneId')}</span>
                  <code title={connection.external_id}>
                    {compactID(connection.external_id || '—')}
                  </code>
                </div>
                <div>
                  <span>{t('connections.connection')}</span>
                  <code title={connection.id}>{compactID(connection.id)}</code>
                </div>
              </div>
            </div>
            <div className="connection-card-footer">
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <Link to={`/connections/${encodeURIComponent(connection.id)}`}>
                  {t('connections.viewDetail')}
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <Link
                  to={`/inbox?connection=${encodeURIComponent(connection.id)}`}
                >
                  <MessageCircle />
                  {t('connections.chats')}
                </Link>
              </Button>
              {canWrite && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(connection)}
                >
                  <Pencil />
                  {t('connections.editAction')}
                </Button>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

import type { Connection } from '@wapo/sdk'
import type { MessageKey } from '../app/i18n'

export function connectionTypeKey(connection: Connection): MessageKey {
  return connection.connection_type === 'coexistence'
    ? 'connections.coexistenceType'
    : 'connections.dedicatedType'
}

export function compactID(id: string) {
  return id.length > 20 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id
}

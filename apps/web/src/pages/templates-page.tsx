import { useState } from 'react'
import type { Connection } from '@wapo/sdk'
import { usePaged } from '../hooks/use-paged'
import {
  PageHeader,
  Loading,
  ErrorNotice,
  Empty,
  LoadMore,
} from '../components/ui'
import { NativeSelect } from '../components/ui/native-select'
import { TemplateList } from '../components/template-list'
import { useI18n } from '../app/i18n'

export function TemplatesPage() {
  const { t } = useI18n()
  const connections = usePaged<Connection>('/v1/connections?channel=whatsapp')
  const [chosen, setChosen] = useState('')
  const accounts = [
    ...new Map(
      connections.items
        .filter((connection) => connection.business_account_id)
        .map((connection) => [connection.business_account_id, connection]),
    ).values(),
  ]
  const selected =
    accounts.find((connection) => connection.id === chosen) || accounts[0]

  return (
    <>
      <PageHeader
        title={t('templates')}
        description={t('templates.description')}
      />
      <ErrorNotice error={connections.error} />
      {connections.isLoading && <Loading variant="table" />}
      {selected && (
        <>
          <div className="mb-5 max-w-sm">
            <NativeSelect
              aria-label="Cuenta de templates"
              value={selected.id}
              onChange={(event) => setChosen(event.target.value)}
            >
              {accounts.map((connection) => (
                <option
                  value={connection.id}
                  key={connection.id}
                >
                  {connection.name ||
                    connection.display_phone_number ||
                    'WhatsApp'}
                </option>
              ))}
            </NativeSelect>
          </div>
          <TemplateList
            key={selected.id}
            connection={selected}
            connectionId={selected.id}
          />
        </>
      )}
      {!connections.isLoading && !connections.error && !accounts.length && (
        <Empty title={t('templates.noAccounts')}>
          {t('templates.noAccountsDescription')}
        </Empty>
      )}
      <LoadMore
        available={connections.hasNextPage}
        busy={connections.isFetchingNextPage}
        load={() => void connections.fetchNextPage()}
      />
    </>
  )
}

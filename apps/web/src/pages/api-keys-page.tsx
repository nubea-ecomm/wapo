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
import { useI18n } from '../app/i18n'

export function ApiKeysPage() {
  const { t } = useI18n()
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
      <PageHeader
        title="API keys"
        description={t('apiKeys.description')}
      />
      <Panel title={t('apiKeys.new')}>
        <form
          className="form-row"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate()
          }}
        >
          <Field label={t('apiKeys.integrationName')}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder={t('apiKeys.placeholder')}
            />
          </Field>
          <Button
            variant="default"
            size="default"

            disabled={!session?.tenantId || create.isPending}
          >
            <KeyRound size={15} />{' '}
            {create.isPending ? t('apiKeys.creating') : t('apiKeys.create')}
          </Button>
        </form>
        <ErrorNotice error={create.error} />
        {revealed && (
          <div className="secret-result">
            <b>{t('apiKeys.oneTime')}</b>
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
            <Button
              variant="link"
              size="default"
              onClick={() => setRevealed('')}
            >
              {t('apiKeys.hide')}
            </Button>
          </div>
        )}
      </Panel>
      <Panel
        className="resource-table"
        title={t('apiKeys.projectKeys')}
      >
        <ErrorNotice error={keys.error || revoke.error} />
        {keys.isLoading && <Loading variant="table" />}
        {keys.data?.data.length ? (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('apiKeys.prefix')}</TableHead>
                  <TableHead>{t('common.created')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
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
                            label: t('apiKeys.revoke'),
                            description: t('apiKeys.revokeDescription'),
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
            <Empty title={t('apiKeys.none')}>
              {t('apiKeys.noneDescription')}
            </Empty>
          )
        )}
      </Panel>
      <p className="hint">
        Cada clave tiene acceso completo a un proyecto. Las claves de proyecto
        no pueden administrar otros proyectos.
      </p>
    </>
  )
}

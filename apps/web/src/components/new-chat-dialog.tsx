import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { Connection, Page } from '@nubea-ecomm/wapo-sdk'
import { useApi } from '../hooks/use-api'
import { WhatsAppIcon } from './icons/whatsapp-icon'
import { NativeSelect } from './ui/native-select'
import { FormDialog } from './form-dialog'
import { Button } from './ui/button'
import { Field, ErrorNotice } from './ui'
import { TemplateSendDialog } from './template-send-dialog'
import { useI18n } from '../app/i18n'

export function NewChatDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [connectionId, setConnectionId] = useState('')
  const { t } = useI18n()
  const [composing, setComposing] = useState(false)
  const connections = useApi<Page<Connection>>('/v1/connections')
  const available = (connections.data?.data || []).filter(
    (connection) =>
      connection.status === 'connected' &&
      connection.channel === 'whatsapp' &&
      connection.credential_status !== 'expired',
  )
  const selected = available.find(
    (connection) => connection.id === connectionId,
  )

  if (composing && selected) {
    return (
      <TemplateSendDialog
        connection={selected}
        title={t('chat.new')}
        onBack={() => setComposing(false)}
        onClose={onClose}
        onSent={(message) => {
          if (message.conversation_id) onCreated(message.conversation_id)
        }}
      />
    )
  }

  return (
    <FormDialog
      title={
        <span className="flex items-center gap-2">
          <WhatsAppIcon size={20} />
          {t('chat.new')}
        </span>
      }
      description={t('chat.chooseConnection')}
      onClose={onClose}
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()

          if (selected) setComposing(true)
        }}
      >
        <Field
          label={t('chat.connection')}
          hint={t('chat.connectionHint')}
        >
          <NativeSelect
            disabled={connections.isLoading}
            value={connectionId}
            onChange={(event) => setConnectionId(event.target.value)}
            required
          >
            <option value="">
              {connections.isLoading
                ? t('chat.loadingConnections')
                : t('chat.chooseConnectionOption')}
            </option>
            {available.map((connection) => (
              <option
                key={connection.id}
                value={connection.id}
              >
                {connection.name ||
                  connection.display_phone_number ||
                  connection.id}
              </option>
            ))}
          </NativeSelect>
        </Field>
        {!connections.isLoading && !available.length && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {t('chat.noConnections')}
          </p>
        )}
        <ErrorNotice error={connections.error} />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={!selected}>
            {t('chat.chooseTemplate')} <ArrowRight />
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}

import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { Connection, Page } from '@wapo/sdk'
import { useApi } from '../hooks/use-api'
import { WhatsAppIcon } from './icons/whatsapp-icon'
import { NativeSelect } from './ui/native-select'
import { FormDialog } from './form-dialog'
import { Button } from './ui/button'
import { Field, ErrorNotice } from './ui'
import { TemplateSendDialog } from './template-send-dialog'

export function NewChatDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [connectionId, setConnectionId] = useState('')
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
        title="Nueva conversación"
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
          Nueva conversación
        </span>
      }
      description="Elegí desde qué número vas a iniciar el contacto."
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
          label="Conexión de WhatsApp"
          hint="Solo se muestran conexiones activas y con credenciales vigentes."
        >
          <NativeSelect
            disabled={connections.isLoading}
            value={connectionId}
            onChange={(event) => setConnectionId(event.target.value)}
            required
          >
            <option value="">
              {connections.isLoading
                ? 'Cargando conexiones…'
                : 'Elegí una conexión'}
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
            No hay conexiones disponibles para iniciar una conversación.
          </p>
        )}
        <ErrorNotice error={connections.error} />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button disabled={!selected}>
            Elegir template <ArrowRight />
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}

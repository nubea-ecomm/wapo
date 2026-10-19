import { WhatsAppIcon } from './icons/whatsapp-icon'
import { NativeSelect } from '../components/ui/native-select'
import { FormDialog } from './form-dialog'
import { Textarea } from '../components/ui/textarea'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useState } from 'react'
import type { Connection, Page } from '@wapo/sdk'
import { useSession } from '../app/session-context'
import { useApi, useAction } from '../hooks/use-api'
import { Field, ErrorNotice } from './ui'
export function NewChatDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { client } = useSession()
  const [connection, setConnection] = useState('')
  const [to, setTo] = useState('')
  const [text, setText] = useState('')
  const [key, setKey] = useState(() => crypto.randomUUID())
  const connections = useApi<Page<Connection>>('/v1/connections')
  const send = useAction(async () => {
    const result = await client.sendText(connection, to, text, key)
    if (result.data.conversation_id) onCreated(result.data.conversation_id)
    onClose()
  })
  return (
    <FormDialog
      title={
        <span className="flex items-center gap-2">
          <WhatsAppIcon size={20} />
          Nueva conversación
        </span>
      }
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          send.mutate()
        }}
      >
        <Field label="Conexión de WhatsApp">
          <NativeSelect
            disabled={connections.isLoading || send.isPending}
            value={connection}
            onChange={(e) => {
              setConnection(e.target.value)
              setKey(crypto.randomUUID())
            }}
            required
          >
            <option value="">
              {connections.isLoading ? 'Cargando conexiones…' : 'Elegí una conexión'}
            </option>
            {connections.data?.data
              .filter((c) => c.status === 'connected' && c.channel === 'whatsapp')
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.display_phone_number || c.id}
                </option>
              ))}
          </NativeSelect>
        </Field>
        <Field label="Destinatario" hint="Número de WhatsApp con código de país.">
          <Input
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setKey(crypto.randomUUID())
            }}
            required
          />
        </Field>
        <Field label="Mensaje">
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setKey(crypto.randomUUID())
            }}
            required
            rows={4}
          />
        </Field>
        <ErrorNotice error={send.error || connections.error} />
        <p className="hint">
          WhatsApp exige una ventana de atención abierta para texto libre. Para iniciar
          fuera de esa ventana, enviá una plantilla aprobada mediante la API.
        </p>
        <Button
          variant="default"
          size="default"
          disabled={send.isPending || connections.isLoading || !connection}
        >
          {send.isPending ? 'Enviando…' : 'Enviar mensaje'}
        </Button>
      </form>
    </FormDialog>
  )
}

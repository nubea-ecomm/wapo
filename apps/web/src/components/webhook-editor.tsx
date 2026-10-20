import { Checkbox } from './ui/checkbox'
import { NativeSelect } from '../components/ui/native-select'
import { FormDialog } from './form-dialog'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { useState } from 'react'
import type { Connection, Page } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { useApi, useAction } from '../hooks/use-api'
import { Field, ErrorNotice } from './ui'

const availableEvents = [
  'message.sent',
  'whatsapp.template.status_changed',
  'whatsapp.template.category_changed',
  'whatsapp.template.category_change_scheduled',
  'whatsapp.template.quality_changed',
  'whatsapp.message.received',
  'whatsapp.message.sent',
  'whatsapp.message.delivered',
  'whatsapp.message.read',
  'whatsapp.message.failed',
  'whatsapp.phone_number.created',
  'whatsapp.phone_number.deleted',
  'whatsapp.history.received',
  'whatsapp.contacts.received',
  'whatsapp.contact.marketing_preference_changed',
  'whatsapp.account.updated',
]

export function WebhookEditor({ onClose }: { onClose: () => void }) {
  const { client } = useSession()
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [connection, setConnection] = useState('')
  const [events, setEvents] = useState<string[]>(['whatsapp.message.received'])
  const connections = useApi<Page<Connection>>('/v1/connections')
  const create = useAction(async () => {
    if (!events.length) throw new Error('Elegí al menos un evento.')

    await client.createWebhook({
      url,
      secret_key: secret,
      events,
      ...(connection ? { connection_id: connection } : {}),
    })
    setSecret('')
    onClose()
  })

  return (
    <FormDialog
      title="Nuevo webhook"
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault()
          create.mutate()
        }}
      >
        <Field label="URL del receptor">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://tu-app.com/webhooks/wapo"
            required
          />
        </Field>
        <Field label="Secreto para firmas HMAC">
          <Input
            type="password"
            autoComplete="off"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            minLength={16}
            required
          />
        </Field>
        <Field label="Alcance">
          <NativeSelect
            value={connection}
            onChange={(e) => setConnection(e.target.value)}
          >
            <option value="">Todo el proyecto</option>
            {connections.data?.data.map((c) => (
              <option
                key={c.id}
                value={c.id}
              >
                {c.name || c.id}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <fieldset className="event-options">
          <legend>Eventos</legend>
          {availableEvents.map((event) => (
            <label key={event}>
              <Checkbox
                checked={events.includes(event)}
                onCheckedChange={(checked) =>
                  setEvents((current) =>
                    checked === true
                      ? [...current, event]
                      : current.filter((v) => v !== event),
                  )
                }
              />
              <code>{event}</code>
            </label>
          ))}
        </fieldset>
        <ErrorNotice error={create.error || connections.error} />
        <Button
          variant="default"
          size="default"
          disabled={create.isPending}
        >
          {create.isPending ? 'Creando…' : 'Crear webhook'}
        </Button>
      </form>
    </FormDialog>
  )
}

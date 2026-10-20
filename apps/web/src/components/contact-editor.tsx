import { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import type {
  Connection,
  Contact,
  ContactProperty,
} from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { useI18n } from '../app/i18n'
import { useAction } from '../hooks/use-api'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'
import { Textarea } from './ui/textarea'
import { ErrorNotice, Field } from './ui'
import { FormDialog } from './form-dialog'

export function ContactEditor({
  contact,
  connections,
  onClose,
}: {
  contact?: Contact
  connections: Connection[]
  onClose: () => void
}) {
  const { client } = useSession()
  const { t } = useI18n()
  const [connectionID, setConnectionID] = useState(
    contact?.connection_id || connections[0]?.id || '',
  )
  const [phone, setPhone] = useState(contact?.phone_number || '')
  const [name, setName] = useState(contact?.display_name || '')
  const [email, setEmail] = useState(contact?.email || '')
  const [properties, setProperties] = useState(
    JSON.stringify(contact?.properties || {}, null, 2),
  )
  const [useProviderName, setUseProviderName] = useState(false)
  const save = useAction(async () => {
    let parsed: Record<string, ContactProperty>

    try {
      parsed = JSON.parse(properties) as Record<string, ContactProperty>
    } catch {
      throw new Error(t('contacts.propertiesInvalid'))
    }

    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
      throw new Error(t('contacts.propertiesInvalid'))

    if (contact) {
      await client.updateContact(contact.id, {
        ...(useProviderName
          ? { use_provider_name: true as const }
          : name !== contact.display_name
            ? { display_name: name }
            : {}),
        email,
        properties: parsed,
      })
    } else {
      await client.createContact({
        connection_id: connectionID,
        phone_number: phone,
        display_name: name,
        email,
        properties: parsed,
      })
    }

    onClose()
  })

  return (
    <FormDialog
      title={contact ? t('contacts.edit') : t('contacts.new')}
      description={t('contacts.editorDescription')}
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        {contact && (
          <div className="grid gap-3 rounded-md border bg-muted/20 p-3 text-xs sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">{t('contacts.identity')}</p>
              <p className="mt-1 font-medium">{contact.phone_number}</p>
              {(contact.username || contact.business_scoped_user_id) && (
                <p className="mt-1 truncate text-muted-foreground">
                  {contact.username || contact.business_scoped_user_id}
                </p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">{t('contacts.marketing')}</p>
              <p className="mt-1 font-medium">
                {contact.marketing_preference.marketing_allowed
                  ? t('contacts.marketingAllowed')
                  : t('contacts.marketingStopped')}
              </p>
              {contact.marketing_preference.detail && (
                <p className="mt-1 text-muted-foreground">
                  {contact.marketing_preference.detail}
                </p>
              )}
            </div>
          </div>
        )}
        {!contact && (
          <Field label={t('contacts.whatsappConnection')}>
            <NativeSelect
              value={connectionID}
              required
              onChange={(event) => setConnectionID(event.target.value)}
            >
              {connections.map((connection) => (
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
        )}
        {!contact && (
          <Field
            label={t('contacts.phone')}
            hint={t('contacts.phoneHint')}
          >
            <Input
              value={phone}
              inputMode="tel"
              required
              onChange={(event) => setPhone(event.target.value)}
            />
          </Field>
        )}
        <Field label={t('contacts.displayName')}>
          <Input
            value={name}
            maxLength={120}
            required
            autoFocus
            onChange={(event) => {
              setName(event.target.value)
              setUseProviderName(false)
            }}
          />
        </Field>
        {contact && (contact.profile_name || contact.username) && (
          <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/30 px-3 py-2">
            <div className="min-w-0 text-xs">
              <span className="text-muted-foreground">
                {t('contacts.providerName')}:{' '}
              </span>
              <strong className="font-medium">
                {contact.profile_name || contact.username}
              </strong>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setName(
                  contact.profile_name ||
                    contact.username ||
                    contact.phone_number,
                )
                setUseProviderName(true)
              }}
            >
              <RotateCcw /> {t('contacts.useProviderName')}
            </Button>
          </div>
        )}
        <Field label={t('contacts.email')}>
          <Input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field
          label={t('contacts.properties')}
          hint={t('contacts.propertiesHint')}
        >
          <Textarea
            className="code-input min-h-32"
            value={properties}
            onChange={(event) => setProperties(event.target.value)}
          />
        </Field>
        <ErrorNotice error={save.error} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
          >
            {t('common.cancel')}
          </Button>
          <Button disabled={save.isPending || !name.trim() || !connectionID}>
            {save.isPending ? t('saving') : t('contacts.save')}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}

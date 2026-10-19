import { useEffect, useState } from 'react'
import { ArrowLeft, FileText, Phone, Send } from 'lucide-react'
import {
  WapoError,
  type Connection,
  type Message,
  type MessageTemplate,
} from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { usePaged } from '../hooks/use-paged'
import {
  normalizeWhatsAppRecipient,
  templateParameterFields,
  templatePayload,
  templatePreview,
} from '../lib/template-message'
import { FormDialog } from './form-dialog'
import { ErrorNotice, Field, Loading, Status } from './ui'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { NativeSelect } from './ui/native-select'

export function TemplateSendDialog({
  connection,
  template: fixedTemplate,
  recipient = '',
  title = 'Enviar template',
  onClose,
  onBack,
  onSent,
}: {
  connection: Connection
  template?: MessageTemplate
  recipient?: string
  title?: string
  onClose: () => void
  onBack?: () => void
  onSent?: (message: Message) => void
}) {
  const { client } = useSession()
  const templates = usePaged<MessageTemplate>(
    `/v1/connections/${encodeURIComponent(connection.id)}/templates?status=APPROVED`,
  )
  const approved = templates.items.filter(
    (template) => template.status === 'APPROVED',
  )
  const [templateId, setTemplateId] = useState(fixedTemplate?.id || '')
  const [to, setTo] = useState(recipient)
  const [values, setValues] = useState<Record<string, string>>({})
  const [key, setKey] = useState(() => crypto.randomUUID())
  const selected =
    fixedTemplate || approved.find((template) => template.id === templateId)
  const fields = selected ? templateParameterFields(selected) : []
  const preview = selected ? templatePreview(selected, values) : []

  useEffect(() => {
    if (!fixedTemplate && !templateId && approved[0])
      setTemplateId(approved[0].id)
  }, [approved, fixedTemplate, templateId])
  useEffect(() => {
    setValues({})
    setKey(crypto.randomUUID())
  }, [selected?.id])
  const send = useAction(async () => {
    if (!selected) throw new Error('Elegí un template aprobado.')

    try {
      const result = await client.sendTemplate(
        connection.id,
        normalizeWhatsAppRecipient(to),
        templatePayload(selected, values),
        key,
      )

      onSent?.(result.data)
      onClose()
    } catch (error) {
      setKey(crypto.randomUUID())
      throw error
    }
  })
  const valid =
    Boolean(selected && normalizeWhatsAppRecipient(to)) &&
    fields.every((field) => values[field.key]?.trim())

  return (
    <FormDialog
      title={
        <span className="flex items-center gap-2">
          <FileText className="size-5" />
          {title}
        </span>
      }
      description={
        fixedTemplate
          ? `Probá “${fixedTemplate.name}” con un número real.`
          : 'WhatsApp exige un template aprobado para iniciar una conversación.'
      }
      contentClassName="sm:max-w-2xl"
      onClose={onClose}
    >
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()

          if (valid) send.mutate()
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Destinatario"
            hint="Incluí el código de país."
          >
            <div className="relative">
              <Phone className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
              <Input
                className="pl-9"
                aria-label="Destinatario"
                inputMode="tel"
                placeholder="+54 9 11 5555 0000"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value)
                  setKey(crypto.randomUUID())
                }}
                required
              />
            </div>
          </Field>
          <Field label="Template aprobado">
            {fixedTemplate ? (
              <div className="flex h-9 items-center justify-between rounded-md border px-3 text-sm">
                <span className="truncate">{fixedTemplate.name}</span>
                <Status value={fixedTemplate.status} />
              </div>
            ) : (
              <NativeSelect
                value={selected?.id || ''}
                onChange={(event) => setTemplateId(event.target.value)}
                disabled={templates.isLoading}
                required
              >
                <option value="">
                  {templates.isLoading
                    ? 'Cargando templates…'
                    : 'Elegí un template'}
                </option>
                {approved.map((template) => (
                  <option
                    key={template.id}
                    value={template.id}
                  >
                    {template.name} · {template.language}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
        {!fixedTemplate && templates.isLoading && <Loading variant="list" />}
        {!templates.isLoading && !fixedTemplate && !approved.length && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            Esta conexión no tiene templates aprobados. Creá uno y esperá la
            aprobación de Meta antes de iniciar conversaciones.
          </div>
        )}
        {fields.length > 0 && (
          <section className="rounded-lg border p-4">
            <div className="mb-4">
              <h3 className="text-sm font-medium">Parámetros del mensaje</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Completá cada variable exactamente como la recibirá el contacto.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <Field
                  key={field.key}
                  label={field.label}
                >
                  <Input
                    value={values[field.key] || ''}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                      setKey(crypto.randomUUID())
                    }}
                    placeholder={`Valor para {{${field.position}}}`}
                    required
                  />
                </Field>
              ))}
            </div>
          </section>
        )}
        {selected && (
          <section>
            <h3 className="mb-2 text-xs font-medium text-muted-foreground">
              Vista previa
            </h3>
            <div className="max-w-lg rounded-xl rounded-tl-sm border bg-emerald-50 p-4 text-sm text-emerald-950 shadow-xs dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-50">
              {preview.map((part, index) =>
                part.type === 'header' ? (
                  <strong
                    className="mb-2 block"
                    key={index}
                  >
                    {part.text}
                  </strong>
                ) : part.type === 'footer' ? (
                  <small
                    className="mt-3 block opacity-65"
                    key={index}
                  >
                    {part.text}
                  </small>
                ) : (
                  <p
                    className="whitespace-pre-wrap"
                    key={index}
                  >
                    {part.text}
                  </p>
                ),
              )}
            </div>
          </section>
        )}
        <ErrorNotice
          error={
            send.error
              ? new Error(templateSendError(send.error))
              : templates.error
          }
        />
        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-between">
          <div>
            {onBack && (
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
              >
                <ArrowLeft /> Volver
              </Button>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button disabled={!valid || send.isPending}>
              <Send /> {send.isPending ? 'Enviando…' : 'Enviar template'}
            </Button>
          </div>
        </div>
      </form>
    </FormDialog>
  )
}

function templateSendError(error: unknown) {
  if (!(error instanceof WapoError)) return 'No pudimos enviar el template.'

  const body = error.body as {
    error?: {
      code?: number | string
      message?: string
      error_user_msg?: string
    }
  }
  const code = Number(body?.error?.code)

  if (code === 131030) {
    return 'Meta está en modo de prueba y este destinatario no está autorizado. Agregá el número en Meta for Developers → WhatsApp → API Setup → números de destinatario y volvé a intentar.'
  }

  if (code === 132001) {
    return 'Meta no encuentra este template para el idioma seleccionado. Verificá que siga aprobado y sincronizá la lista.'
  }

  if (code === 131026) {
    return 'Meta no pudo entregar el mensaje a este número. Verificá que tenga WhatsApp y el código de país correcto.'
  }

  if (code === 190 || body?.error?.code === 'credential_expired') {
    return 'La autorización de Meta venció. Reconectá el número antes de enviar mensajes.'
  }

  return (
    body?.error?.error_user_msg ||
    body?.error?.message ||
    'Meta rechazó el envío del template.'
  )
}

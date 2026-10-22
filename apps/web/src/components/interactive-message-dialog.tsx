import { useState } from 'react'
import {
  ExternalLink,
  List,
  MessageSquare,
  Send,
  UserRound,
  Workflow,
} from 'lucide-react'
import {
  initialInteractiveDraft,
  interactivePayload,
  type InteractiveKind,
} from '../lib/interactive-message'
import { FormDialog } from './form-dialog'
import { Field, ErrorNotice } from './ui'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { NativeSelect } from './ui/native-select'
import { InteractiveOptions } from './interactive-options'

const kinds = [
  { id: 'button', label: 'Botones', Icon: MessageSquare },
  { id: 'list', label: 'Lista', Icon: List },
  { id: 'cta_url', label: 'Enlace', Icon: ExternalLink },
  { id: 'flow', label: 'Flow', Icon: Workflow },
  { id: 'contacts', label: 'Contacto', Icon: UserRound },
] as const

export function InteractiveMessageDialog({
  onSend,
  onClose,
}: {
  onSend: (payload: Record<string, unknown>, key: string) => Promise<unknown>
  onClose: () => void
}) {
  const [draft, setDraft] = useState(initialInteractiveDraft)
  const [header, setHeader] = useState(false)
  const [key, setKey] = useState(() => crypto.randomUUID())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  const change = (patch: Partial<typeof draft>) => {
    setDraft((current) => ({ ...current, ...patch }))
    setKey(crypto.randomUUID())
    setError(undefined)
  }

  async function send() {
    if (busy) return

    try {
      const payload = interactivePayload({
        ...draft,
        header: header ? draft.header : '',
      })

      setBusy(true)
      await onSend(payload, key)
      onClose()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog
      title="Enviar mensaje interactivo"
      description="Botones, listas y otras formas de continuar la conversación."
      onClose={() => {
        if (!busy) onClose()
      }}
      contentClassName="sm:max-w-2xl"
    >
      <form
        className="grid gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <fieldset
          disabled={busy}
          className="grid min-w-0 gap-5"
        >
          <div
            className="interactive-tabs"
            aria-label="Tipo de mensaje"
          >
            {kinds.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                aria-pressed={draft.kind === id}
                onClick={() =>
                  change({
                    kind: id as InteractiveKind,
                    choices: draft.choices.slice(0, id === 'button' ? 3 : 10),
                  })
                }
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
          {draft.kind !== 'contacts' && (
            <>
              <Field label="Encabezado (opcional)">
                <NativeSelect
                  value={header ? 'text' : 'none'}
                  onChange={(e) => {
                    setHeader(e.target.value === 'text')
                    setKey(crypto.randomUUID())
                  }}
                >
                  <option value="none">Sin encabezado</option>
                  <option value="text">Texto</option>
                </NativeSelect>
              </Field>
              {header && (
                <Input
                  aria-label="Texto del encabezado"
                  value={draft.header}
                  onChange={(e) => change({ header: e.target.value })}
                  maxLength={60}
                  placeholder="Encabezado"
                />
              )}
              <Field
                label="Cuerpo del mensaje"
                hint={`${draft.body.length}/1024`}
              >
                <Textarea
                  value={draft.body}
                  onChange={(e) => change({ body: e.target.value })}
                  placeholder="Escribí el mensaje…"
                  rows={4}
                  maxLength={1024}
                  required
                />
              </Field>
              <Field label="Pie (opcional)">
                <Input
                  value={draft.footer}
                  onChange={(e) => change({ footer: e.target.value })}
                  maxLength={60}
                  placeholder="Texto al pie"
                />
              </Field>
            </>
          )}
          <InteractiveOptions
            draft={draft}
            change={change}
            disabled={busy}
          />
        </fieldset>
        <ErrorNotice error={error} />
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            className="chat-primary-button"
            disabled={busy}
          >
            <Send />
            {busy ? 'Enviando…' : 'Enviar'}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}

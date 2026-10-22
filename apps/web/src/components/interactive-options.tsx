import { Plus, Trash2 } from 'lucide-react'
import type { InteractiveDraft } from '../lib/interactive-message'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Field } from './ui'

export function InteractiveOptions({
  draft,
  change,
  disabled,
}: {
  draft: InteractiveDraft
  change: (patch: Partial<InteractiveDraft>) => void
  disabled: boolean
}) {
  if (draft.kind === 'contacts')
    return (
      <div className="grid gap-4">
        <Field label="Nombre del contacto">
          <Input
            value={draft.name}
            onChange={(e) => change({ name: e.target.value })}
            maxLength={100}
            required
          />
        </Field>
        <Field label="Teléfono">
          <Input
            value={draft.phone}
            onChange={(e) => change({ phone: e.target.value })}
            placeholder="+54 9 11…"
            required
          />
        </Field>
        <Field label="Email (opcional)">
          <Input
            type="email"
            value={draft.email}
            onChange={(e) => change({ email: e.target.value })}
          />
        </Field>
        <p className="text-xs text-muted-foreground">
          Se enviará una tarjeta de contacto que el destinatario podrá guardar.
        </p>
      </div>
    )

  return (
    <>
      {draft.kind !== 'button' && (
        <Field label="Texto del botón">
          <Input
            value={draft.label}
            onChange={(e) => change({ label: e.target.value })}
            maxLength={draft.kind === 'flow' ? 30 : 20}
            required
          />
        </Field>
      )}
      {draft.kind === 'cta_url' && (
        <Field label="URL de destino">
          <Input
            type="url"
            value={draft.url}
            onChange={(e) => change({ url: e.target.value })}
            placeholder="https://…"
            required
          />
        </Field>
      )}
      {draft.kind === 'flow' && (
        <>
          <Field label="ID del Flow publicado">
            <Input
              value={draft.flowId}
              onChange={(e) => change({ flowId: e.target.value })}
              inputMode="numeric"
              required
            />
          </Field>
          <Field label="Pantalla inicial (opcional)">
            <Input
              value={draft.screen}
              onChange={(e) => change({ screen: e.target.value })}
              placeholder="FIRST_ENTRY_SCREEN"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            El Flow debe estar publicado en la cuenta de WhatsApp de esta
            conexión.
          </p>
        </>
      )}
      {(draft.kind === 'button' || draft.kind === 'list') && (
        <>
          {draft.kind === 'list' && (
            <Field label="Título de la sección">
              <Input
                value={draft.section}
                onChange={(e) => change({ section: e.target.value })}
                maxLength={24}
                required
              />
            </Field>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              {draft.kind === 'button'
                ? 'Botones de respuesta'
                : 'Opciones de la lista'}{' '}
              ({draft.choices.length}/{draft.kind === 'button' ? 3 : 10})
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={
                disabled ||
                draft.choices.length >= (draft.kind === 'button' ? 3 : 10)
              }
              onClick={() =>
                change({
                  choices: [
                    ...draft.choices,
                    { id: crypto.randomUUID(), title: '', description: '' },
                  ],
                })
              }
            >
              <Plus /> Agregar
            </Button>
          </div>
          {draft.choices.map((choice, index) => (
            <div
              key={choice.id}
              className="grid gap-2 rounded-lg border p-3"
            >
              <div className="flex gap-2">
                <Input
                  aria-label={`Opción ${index + 1}`}
                  value={choice.title}
                  placeholder={`Opción ${index + 1}`}
                  maxLength={draft.kind === 'button' ? 20 : 24}
                  onChange={(e) =>
                    change({
                      choices: draft.choices.map((item) =>
                        item.id === choice.id
                          ? { ...item, title: e.target.value }
                          : item,
                      ),
                    })
                  }
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Eliminar opción ${index + 1}`}
                  disabled={disabled || draft.choices.length === 1}
                  onClick={() =>
                    change({
                      choices: draft.choices.filter(
                        (item) => item.id !== choice.id,
                      ),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </div>
              {draft.kind === 'list' && (
                <Input
                  aria-label={`Descripción ${index + 1}`}
                  value={choice.description}
                  placeholder="Descripción opcional"
                  maxLength={72}
                  onChange={(e) =>
                    change({
                      choices: draft.choices.map((item) =>
                        item.id === choice.id
                          ? { ...item, description: e.target.value }
                          : item,
                      ),
                    })
                  }
                />
              )}
            </div>
          ))}
        </>
      )}
    </>
  )
}

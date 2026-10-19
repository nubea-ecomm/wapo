import { useState } from 'react'
import type { TemplateInput } from '@nubea-ecomm/wapo-sdk'
import { useSession } from '../app/session-context'
import { useAction } from '../hooks/use-api'
import { FormDialog } from './form-dialog'
import { Field, ErrorNotice } from './ui'
import { Input } from './ui/input'
import { Textarea } from './ui/textarea'
import { NativeSelect } from './ui/native-select'
import { Button } from './ui/button'

export function TemplateEditor({
  connectionId,
  onClose,
}: {
  connectionId: string
  onClose: () => void
}) {
  const { client } = useSession()
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('es')
  const [category, setCategory] = useState<'MARKETING' | 'UTILITY'>('UTILITY')
  const [body, setBody] = useState('')
  const [header, setHeader] = useState('')
  const [footer, setFooter] = useState('')
  const [examples, setExamples] = useState<Record<string, string>>({})
  const [advanced, setAdvanced] = useState(false)
  const [json, setJSON] = useState(
    '{\n  "name": "",\n  "language": "es",\n  "category": "UTILITY",\n  "components": [{"type": "BODY", "text": ""}]\n}',
  )
  const variables = [
    ...new Set([...body.matchAll(/\{\{(\d+)\}\}/g)].map((match) => match[1])),
  ].sort((a, b) => Number(a) - Number(b))

  function input(): TemplateInput {
    if (advanced) return JSON.parse(json) as TemplateInput

    const components: Record<string, unknown>[] = []

    if (header.trim())
      components.push({ type: 'HEADER', format: 'TEXT', text: header.trim() })

    components.push({
      type: 'BODY',
      text: body,
      ...(variables.length
        ? {
            example: {
              body_text: [variables.map((key) => examples[key] || '')],
            },
          }
        : {}),
    })

    if (footer.trim()) components.push({ type: 'FOOTER', text: footer.trim() })

    return { name, language, category, components }
  }

  const create = useAction(async () => {
    await client.createTemplate(connectionId, input())
    onClose()
  })

  return (
    <FormDialog
      title="Crear template"
      description="Se envía a Meta para revisión."
      onClose={onClose}
    >
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <div
          className="flex gap-2"
          role="group"
          aria-label="Editor de template"
        >
          <Button
            type="button"
            variant={!advanced ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setAdvanced(false)}
          >
            Texto
          </Button>
          <Button
            type="button"
            variant={advanced ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              if (!advanced) {
                try {
                  setJSON(JSON.stringify(input(), null, 2))
                } catch {
                  /* Keep the current JSON when incomplete. */
                }
              }

              setAdvanced(true)
            }}
          >
            JSON
          </Button>
        </div>
        {advanced ? (
          <Field
            label="Definición del template"
            hint="Admite componentes de Meta: botones, medios y autenticación."
          >
            <Textarea
              className="font-mono text-xs"
              rows={15}
              value={json}
              onChange={(event) => setJSON(event.target.value)}
              required
            />
          </Field>
        ) : (
          <>
            <Field
              label="Nombre"
              hint="Minúsculas, números y guiones bajos."
            >
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                pattern="[a-z0-9_]+"
                maxLength={512}
                placeholder="confirmacion_pedido"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Idioma">
                <Input
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  placeholder="es"
                  required
                />
              </Field>
              <Field label="Categoría">
                <NativeSelect
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as typeof category)
                  }
                >
                  <option value="UTILITY">Utilidad</option>
                  <option value="MARKETING">Marketing</option>
                </NativeSelect>
              </Field>
            </div>
            <Field
              label="Mensaje"
              hint="Usá {{1}}, {{2}} para variables."
            >
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                rows={5}
                maxLength={1024}
                required
                placeholder="Hola {{1}}, recibimos tu pedido {{2}}."
              />
            </Field>
            {variables.length > 0 && (
              <div className="grid gap-3 rounded-md border p-3">
                <h3 className="m-0 text-xs">Ejemplos para revisión</h3>
                {variables.map((key) => (
                  <Field
                    key={key}
                    label={`Ejemplo {{${key}}}`}
                  >
                    <Input
                      value={examples[key] || ''}
                      onChange={(event) =>
                        setExamples((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      required
                    />
                  </Field>
                ))}
              </div>
            )}
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-xs font-medium">
                Encabezado y pie opcionales
              </summary>
              <div className="mt-3 grid gap-3">
                <Field label="Encabezado">
                  <Input
                    maxLength={60}
                    value={header}
                    onChange={(event) => setHeader(event.target.value)}
                  />
                </Field>
                <Field label="Pie">
                  <Input
                    maxLength={60}
                    value={footer}
                    onChange={(event) => setFooter(event.target.value)}
                  />
                </Field>
              </div>
            </details>
            {body && (
              <div className="rounded-lg border bg-muted/40 p-4 text-sm whitespace-pre-wrap">
                {header && <strong className="mb-2 block">{header}</strong>}
                {body}
                {footer && (
                  <small className="mt-2 text-muted-foreground">{footer}</small>
                )}
              </div>
            )}
          </>
        )}
        <ErrorNotice error={create.error} />
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={create.isPending}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button disabled={create.isPending}>
            {create.isPending ? 'Enviando…' : 'Enviar a revisión'}
          </Button>
        </div>
      </form>
    </FormDialog>
  )
}

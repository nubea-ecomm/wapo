export type InteractiveKind =
  'button' | 'list' | 'cta_url' | 'flow' | 'contacts'

export interface InteractiveDraft {
  kind: InteractiveKind
  header: string
  body: string
  footer: string
  choices: { id: string; title: string; description: string }[]
  label: string
  section: string
  url: string
  flowId: string
  screen: string
  name: string
  phone: string
  email: string
}

export const initialInteractiveDraft = (): InteractiveDraft => ({
  kind: 'button',
  header: '',
  body: '',
  footer: '',
  choices: [{ id: crypto.randomUUID(), title: '', description: '' }],
  label: 'Ver opciones',
  section: 'Opciones',
  url: '',
  flowId: '',
  screen: '',
  name: '',
  phone: '',
  email: '',
})

function required(value: string, max: number, label: string) {
  if (!value.trim() || value.length > max)
    throw new Error(`${label}: ingresá entre 1 y ${max} caracteres.`)

  return value.trim()
}

export function interactivePayload(
  draft: InteractiveDraft,
): Record<string, unknown> {
  if (draft.kind === 'contacts') {
    const name = required(draft.name, 100, 'Nombre')
    const phone = draft.phone.replace(/[\s()-]/g, '')

    if (!/^\+?[1-9]\d{6,14}$/.test(phone))
      throw new Error('Ingresá el teléfono con código de país.')

    if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email))
      throw new Error('Ingresá un email válido.')

    return {
      type: 'contacts',
      contacts: [
        {
          name: { formatted_name: name, first_name: name },
          phones: [{ phone, type: 'CELL' }],
          ...(draft.email
            ? { emails: [{ email: draft.email, type: 'WORK' }] }
            : {}),
        },
      ],
    }
  }

  const body = required(draft.body, 1024, 'Mensaje')

  if (draft.header.length > 60 || draft.footer.length > 60)
    throw new Error('El encabezado y el pie admiten hasta 60 caracteres.')

  let action: Record<string, unknown>

  if (draft.kind === 'button' || draft.kind === 'list') {
    const max = draft.kind === 'button' ? 3 : 10

    if (!draft.choices.length || draft.choices.length > max)
      throw new Error(`Agregá entre 1 y ${max} opciones.`)

    const choices = draft.choices.map((choice) => ({
      ...choice,
      title: required(
        choice.title,
        draft.kind === 'button' ? 20 : 24,
        'Opción',
      ),
    }))

    if (new Set(choices.map((choice) => choice.title)).size !== choices.length)
      throw new Error('Las opciones deben tener títulos diferentes.')

    if (choices.some((choice) => choice.description.length > 72))
      throw new Error('Las descripciones admiten hasta 72 caracteres.')

    action =
      draft.kind === 'button'
        ? {
            buttons: choices.map(({ id, title }) => ({
              type: 'reply',
              reply: { id, title },
            })),
          }
        : {
            button: required(draft.label, 20, 'Texto del botón'),
            sections: [
              {
                title: required(draft.section, 24, 'Sección'),
                rows: choices.map(({ id, title, description }) => ({
                  id,
                  title,
                  ...(description ? { description } : {}),
                })),
              },
            ],
          }
  } else if (draft.kind === 'cta_url') {
    let url: URL

    try {
      url = new URL(draft.url)
    } catch {
      throw new Error('Ingresá una URL válida.')
    }

    if (
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error('La URL debe comenzar con https:// o http://.')

    action = {
      name: 'cta_url',
      parameters: {
        display_text: required(draft.label, 20, 'Texto del botón'),
        url: url.href,
      },
    }
  } else {
    if (!/^\d+$/.test(draft.flowId))
      throw new Error(
        'Ingresá el ID del Flow publicado en esta cuenta de WhatsApp.',
      )

    action = {
      name: 'flow',
      parameters: {
        flow_message_version: '3',
        flow_id: draft.flowId,
        flow_cta: required(draft.label, 30, 'Texto del botón'),
        mode: 'published',
        flow_action: 'navigate',
        ...(draft.screen.trim()
          ? { flow_action_payload: { screen: draft.screen.trim() } }
          : {}),
      },
    }
  }

  return {
    type: 'interactive',
    interactive: {
      type: draft.kind,
      body: { text: body },
      ...(draft.header.trim()
        ? { header: { type: 'text', text: draft.header.trim() } }
        : {}),
      ...(draft.footer.trim() ? { footer: { text: draft.footer.trim() } } : {}),
      action,
    },
  }
}

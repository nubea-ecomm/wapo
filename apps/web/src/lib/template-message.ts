import type { MessageTemplate } from '@wapo/sdk'

export interface TemplateParameterField {
  key: string
  component: 'header' | 'body'
  position: number
  label: string
}

export function templateParameterFields(template: MessageTemplate) {
  const fields: TemplateParameterField[] = []
  for (const component of template.components) {
    const type = String(component.type || '').toLowerCase()
    if (
      (type !== 'header' && type !== 'body') ||
      typeof component.text !== 'string'
    )
      continue
    const positions = [
      ...new Set(
        [...component.text.matchAll(/\{\{(\d+)\}\}/g)].map((match) =>
          Number(match[1]),
        ),
      ),
    ].sort((a, b) => a - b)
    for (const position of positions) {
      fields.push({
        key: `${type}:${position}`,
        component: type,
        position,
        label: `${type === 'header' ? 'Encabezado' : 'Mensaje'} · parámetro ${position}`,
      })
    }
  }
  return fields
}

export function templatePayload(
  template: MessageTemplate,
  values: Record<string, string>,
) {
  const grouped = new Map<'header' | 'body', TemplateParameterField[]>()
  for (const field of templateParameterFields(template)) {
    grouped.set(field.component, [
      ...(grouped.get(field.component) || []),
      field,
    ])
  }
  const components = [...grouped.entries()].map(([type, fields]) => ({
    type,
    parameters: fields.map((field) => ({
      type: 'text',
      text: values[field.key] || '',
    })),
  }))
  return {
    name: template.name,
    language: { code: template.language },
    ...(components.length ? { components } : {}),
  }
}

export function templatePreview(
  template: MessageTemplate,
  values: Record<string, string>,
) {
  return template.components
    .filter((component) => typeof component.text === 'string')
    .map((component) => {
      const type = String(component.type || '').toLowerCase()
      const text = String(component.text).replace(
        /\{\{(\d+)\}\}/g,
        (_, position) => {
          return values[`${type}:${position}`] || `{{${position}}}`
        },
      )
      return { type, text }
    })
}

export function normalizeWhatsAppRecipient(value: string) {
  return value.replace(/\D/g, '')
}

import { describe, expect, it } from 'vitest'
import type { MessageTemplate } from '@nubea-ecomm/wapo-sdk'
import {
  normalizeWhatsAppRecipient,
  templateParameterFields,
  templatePayload,
  templatePreview,
} from './template-message'

const template: MessageTemplate = {
  id: 'tpl',
  name: 'back_in_stock',
  language: 'es',
  category: 'UTILITY',
  status: 'APPROVED',
  components: [
    { type: 'HEADER', text: 'Hola {{1}}' },
    { type: 'BODY', text: 'El producto {{1}} volvió. Miralo en {{2}}' },
    { type: 'FOOTER', text: 'Respondé si necesitás ayuda' },
  ],
}

describe('template message payloads', () => {
  it('builds ordered Meta parameters for each component', () => {
    expect(templateParameterFields(template).map((field) => field.key)).toEqual(
      ['header:1', 'body:1', 'body:2'],
    )
    expect(
      templatePayload(template, {
        'header:1': 'Ana',
        'body:1': 'Café',
        'body:2': 'https://example.com',
      }),
    ).toMatchObject({
      name: 'back_in_stock',
      language: { code: 'es' },
      components: [
        { type: 'header', parameters: [{ type: 'text', text: 'Ana' }] },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: 'Café' },
            { type: 'text', text: 'https://example.com' },
          ],
        },
      ],
    })
  })

  it('renders a preview and normalizes the recipient', () => {
    expect(templatePreview(template, { 'header:1': 'Ana' })[0].text).toBe(
      'Hola Ana',
    )
    expect(normalizeWhatsAppRecipient('+54 9 11 5555-0000')).toBe(
      '5491155550000',
    )
  })
})

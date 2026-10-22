import { expect, it } from 'vitest'
import {
  initialInteractiveDraft,
  interactivePayload,
} from './interactive-message'

it('builds Meta reply buttons with stable IDs and enforces provider limits', () => {
  const draft = {
    ...initialInteractiveDraft(),
    body: 'Elegí una opción',
    header: 'Pedido',
    footer: 'Soporte',
    choices: [{ id: 'yes', title: 'Sí', description: '' }],
  }

  expect(interactivePayload(draft)).toEqual({
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: draft.body },
      header: { type: 'text', text: 'Pedido' },
      footer: { text: 'Soporte' },
      action: {
        buttons: [{ type: 'reply', reply: { id: 'yes', title: 'Sí' } }],
      },
    },
  })
  expect(() =>
    interactivePayload({
      ...draft,
      choices: Array.from({ length: 4 }, (_, index) => ({
        id: String(index),
        title: `Opción ${index}`,
        description: '',
      })),
    }),
  ).toThrow('1 y 3')
  expect(() =>
    interactivePayload({ ...draft, body: 'x'.repeat(1025) }),
  ).toThrow('1024')
})

it('builds list, safe CTA URL, published Flow and contact card payloads', () => {
  const draft = {
    ...initialInteractiveDraft(),
    body: 'Continuar',
    label: 'Abrir',
    choices: [{ id: 'option', title: 'Primera', description: 'Detalle' }],
  }

  expect(interactivePayload({ ...draft, kind: 'list' })).toMatchObject({
    interactive: {
      type: 'list',
      action: {
        button: 'Abrir',
        sections: [
          {
            rows: [{ id: 'option', title: 'Primera', description: 'Detalle' }],
          },
        ],
      },
    },
  })
  expect(
    interactivePayload({
      ...draft,
      kind: 'cta_url',
      url: 'https://example.com/order',
    }),
  ).toMatchObject({
    interactive: {
      action: {
        name: 'cta_url',
        parameters: { display_text: 'Abrir', url: 'https://example.com/order' },
      },
    },
  })
  expect(() =>
    interactivePayload({
      ...draft,
      kind: 'cta_url',
      url: 'javascript:alert(1)',
    }),
  ).toThrow('https://')
  expect(
    interactivePayload({
      ...draft,
      kind: 'flow',
      flowId: '123456',
      screen: 'WELCOME',
    }),
  ).toMatchObject({
    interactive: {
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_id: '123456',
          mode: 'published',
          flow_action_payload: { screen: 'WELCOME' },
        },
      },
    },
  })
  expect(
    interactivePayload({
      ...draft,
      kind: 'contacts',
      name: 'Soporte',
      phone: '+54 11 1234-5678',
    }),
  ).toMatchObject({
    type: 'contacts',
    contacts: [
      {
        name: { formatted_name: 'Soporte' },
        phones: [{ phone: '+541112345678' }],
      },
    ],
  })
})

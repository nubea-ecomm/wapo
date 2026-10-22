import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { WhatsAppText } from './whatsapp-text'

it('renders WhatsApp formatting without executing provider HTML', () => {
  const { container } = render(
    <WhatsAppText
      text={
        '*negrita* _cursiva_ ~tachado~ ```código``` <img src=x onerror=alert(1)>'
      }
    />,
  )

  expect(screen.getByText('negrita').tagName).toBe('STRONG')
  expect(screen.getByText('cursiva').tagName).toBe('EM')
  expect(screen.getByText('tachado').tagName).toBe('DEL')
  expect(screen.getByText('código').tagName).toBe('CODE')
  expect(container.querySelector('img')).toBeNull()
  expect(container.textContent).toContain('<img src=x onerror=alert(1)>')
})

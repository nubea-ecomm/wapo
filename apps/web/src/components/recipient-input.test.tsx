import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { RecipientInput } from './recipient-input'

function Fixture({
  suggestions = [],
}: {
  suggestions?: Array<{ id: string; name: string; email: string }>
}) {
  const [recipients, setRecipients] = useState<string[]>([])

  return (
    <RecipientInput
      value={recipients}
      onChange={setRecipients}
      suggestions={suggestions}
    />
  )
}

describe('recipient input', () => {
  it('creates chips with comma or Enter and removes them with X', async () => {
    const user = userEvent.setup()

    render(<Fixture />)
    const input = screen.getByRole('combobox', { name: 'Destinatarios' })

    await user.type(input, 'OPS@example.com,')
    expect(screen.getByText('ops@example.com')).toBeInTheDocument()

    await user.type(input, 'owner@example.com{Enter}')
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', {
        name: 'Eliminar destinatario ops@example.com',
      }),
    )
    expect(screen.queryByText('ops@example.com')).not.toBeInTheDocument()
    expect(screen.getByText('owner@example.com')).toBeInTheDocument()
  })

  it('suggests project users but still accepts external addresses', async () => {
    const user = userEvent.setup()

    render(
      <Fixture
        suggestions={[
          { id: 'user-1', name: 'Ana Pérez', email: 'ana@example.com' },
        ]}
      />,
    )
    const input = screen.getByRole('combobox', { name: 'Destinatarios' })

    await user.click(input)
    await user.type(input, 'ana')
    expect(
      screen.getByRole('option', { name: /Ana Pérez/ }),
    ).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()

    await user.type(input, 'external@outside.com,')
    expect(screen.getByText('external@outside.com')).toBeInTheDocument()
  })
})

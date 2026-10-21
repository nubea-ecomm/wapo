import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { SelectField } from './select-field'

it('preserves labels, disabled options and required form submission', async () => {
  const submit = vi.fn()

  function Form() {
    const [value, setValue] = useState('')

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit(new FormData(event.currentTarget).get('connection'))
        }}
      >
        <label htmlFor="connection">Connection</label>
        <SelectField
          id="connection"
          name="connection"
          value={value}
          onValueChange={setValue}
          required
        >
          <option value="">Choose a connection</option>
          <option
            value="blocked"
            disabled
          >
            Unavailable
          </option>
          <option value="sales">Sales</option>
        </SelectField>
        <button type="submit">Save</button>
      </form>
    )
  }

  render(<Form />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(submit).not.toHaveBeenCalled()
  await user.click(screen.getByLabelText('Connection'))
  expect(
    await screen.findByRole('option', { name: 'Unavailable' }),
  ).toHaveAttribute('aria-disabled', 'true')
  await user.click(screen.getByRole('option', { name: 'Sales' }))
  expect(
    screen.getByRole('combobox', { name: 'Connection' }),
  ).toHaveTextContent('Sales')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(submit).toHaveBeenCalledWith('sales')
})

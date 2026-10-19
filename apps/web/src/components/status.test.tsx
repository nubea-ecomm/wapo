import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Status } from './ui'

describe('status badges', () => {
  it('uses semantic colors for positive, pending and negative states', () => {
    render(
      <>
        <Status value="APPROVED" />
        <Status value="PENDING" label="En revisión" />
        <Status value="REJECTED" />
      </>,
    )
    expect(screen.getByText('Aprobado')).toHaveClass(/emerald/)
    expect(screen.getByText('En revisión')).toHaveClass(/amber/)
    expect(screen.getByText('Rechazado')).toHaveClass(/red/)
  })
})

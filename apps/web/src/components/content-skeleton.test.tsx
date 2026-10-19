import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ContentSkeleton, RouteSkeleton } from './content-skeleton'

describe('content skeletons', () => {
  it('renders a table-shaped loading state for resource collections', () => {
    const { container } = render(
      <ContentSkeleton
        variant="table"
        rows={3}
      />,
    )
    expect(
      screen.getByRole('status', { name: 'Cargando contenido' }),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-skeleton="table"]'),
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-skeleton="table"] > div > div'),
    ).toHaveLength(4)
  })

  it('keeps the route shell and chooses a layout matching the destination', () => {
    const { container, rerender } = render(<RouteSkeleton path="/inbox" />)
    expect(
      screen.getByRole('status', { name: 'Cargando contenido' }),
    ).toBeInTheDocument()
    expect(
      container.querySelector('[data-skeleton="inbox"]'),
    ).toBeInTheDocument()

    rerender(<RouteSkeleton path="/connections" />)
    expect(
      container.querySelector('[data-skeleton="cards"]'),
    ).toBeInTheDocument()

    rerender(<RouteSkeleton path="/settings" />)
    expect(
      container.querySelector('[data-skeleton="settings"]'),
    ).toBeInTheDocument()
  })
})

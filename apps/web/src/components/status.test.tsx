import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Status } from './ui'
import { I18nContext, messages } from '../app/i18n'

describe('status badges', () => {
  it('uses semantic colors for positive, pending and negative states', () => {
    render(
      <>
        <Status value="APPROVED" />
        <Status
          value="PENDING"
          label="En revisión"
        />
        <Status value="REJECTED" />
      </>,
    )
    expect(screen.getByText('Aprobado')).toHaveClass(/emerald/)
    expect(screen.getByText('En revisión')).toHaveClass(/amber/)
    expect(screen.getByText('Rechazado')).toHaveClass(/red/)
  })

  it('translates every known status instead of falling back to Spanish', () => {
    render(
      <I18nContext.Provider
        value={{ language: 'en', t: (key) => messages.en[key] }}
      >
        <Status value="credential_expired" />
      </I18nContext.Provider>,
    )

    expect(screen.getByText('Token expired')).toBeInTheDocument()
  })
})

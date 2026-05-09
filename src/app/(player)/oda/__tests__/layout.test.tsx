import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import OdaLayout from '../layout'

describe('OdaLayout', () => {
  test('1) Ana Sayfa linki /arena\'ya baglidir', () => {
    render(<OdaLayout><div /></OdaLayout>)
    const link = screen.getByRole('link', { name: /ana sayfa/i })
    expect(link).toHaveAttribute('href', '/arena')
  })

  test('2) children render edilir', () => {
    render(<OdaLayout><span data-testid="child">icerik</span></OdaLayout>)
    expect(screen.getByTestId('child')).toBeInTheDocument()
  })

  test('3) aria-label donen ok isaretli buton', () => {
    render(<OdaLayout><div /></OdaLayout>)
    expect(screen.getByLabelText(/ana sayfaya dön/i)).toBeInTheDocument()
  })
})

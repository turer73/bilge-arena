import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import NasilCalisirPage from '../page'

describe('/nasil-calisir', () => {
  it('oyun ve planli calisma yollarini birbirinden ayirir', () => {
    render(<NasilCalisirPage />)

    expect(screen.getByRole('heading', { name: 'İki yol, tek hedef', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oyunlar', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ders Çalış', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Oyun modlarını gör/u })).toHaveAttribute('href', '/arena')
    expect(screen.getByRole('link', { name: /Çalışma yolunu aç/u })).toHaveAttribute(
      'href',
      '/arena/calisma'
    )
  })
})

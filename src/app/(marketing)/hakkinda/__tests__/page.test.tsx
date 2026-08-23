import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import HakkindaPage from '../page'

describe('/hakkinda', () => {
  it('ogrenme sistemi konumlandirmasini ve bilimsel makale baglantisini gosterir', () => {
    render(<HakkindaPage />)

    expect(
      screen.getByRole('heading', { name: 'Öğrenmeyi kanıta dönüştüren sistem', level: 2 })
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Soru yaşam döngüsü', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Kurumsal öğrenme takibi', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Bilimsel ve teknik mimariyi oku/u })).toHaveAttribute(
      'href',
      '/rehber/bilge-arena-ogrenme-sistemi'
    )
  })
})

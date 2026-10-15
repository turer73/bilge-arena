import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { RoomAcademyHero } from '../RoomAcademyHero'

describe('RoomAcademyHero', () => {
  beforeEach(() => localStorage.removeItem('bilge-guide-character-v1'))

  it('oda modunu Bilge Arena akademi dunyasina baglar', () => {
    const { container } = render(<RoomAcademyHero />)
    expect(screen.getByRole('heading', { name: 'Birlikte çöz, birlikte yüksel.' })).toBeInTheDocument()
    expect(screen.getByText(/Bilge Arena’nın birlikte çalışma alanı/)).toBeInTheDocument()
    expect(container.querySelector('[data-room-academy-hero]')).toHaveClass('hidden', 'md:block')
    expect(screen.getByAltText('Kadın Bilge, oda modu rehberin')).toHaveAttribute('src', '/academy/bilge/female/neseli.png')
  })

  it('secilen erkek Bilgeyi oda rehberi olarak kullanir', () => {
    localStorage.setItem('bilge-guide-character-v1', 'male')
    render(<RoomAcademyHero />)
    expect(screen.getByAltText('Erkek Bilge, oda modu rehberin')).toHaveAttribute('src', '/academy/bilge/male/neseli.png')
  })
})

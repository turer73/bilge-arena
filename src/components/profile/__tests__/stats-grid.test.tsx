import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsGrid } from '../stats-grid'

const STATS = [
  { label: 'TOPLAM XP', value: 4085, icon: '⚡', color: 'orange', featured: true },
  { label: 'COIN', value: 151, icon: '🪙', color: 'gold' },
  { label: 'OYUN', value: 40, icon: '🎮', color: 'blue' },
  { label: 'BAŞARI', value: '%45', icon: '🎯', color: 'green' },
  { label: 'EN İYİ SERİ', value: 3, icon: '🔥', color: 'orange' },
]

describe('StatsGrid', () => {
  test('beş metriği Türkçe sayı biçimiyle gösterir', () => {
    render(<StatsGrid stats={STATS} />)

    expect(screen.getByText('4.085')).toBeInTheDocument()
    for (const stat of STATS) {
      expect(screen.getByText(stat.label)).toBeInTheDocument()
    }
  })

  test('öne çıkan XP kartı mobilde tam satır, diğerleri kompakt kalır', () => {
    const { container } = render(<StatsGrid stats={STATS} />)
    const grid = container.firstElementChild as HTMLElement
    const xpCard = screen.getByText('TOPLAM XP').parentElement?.parentElement as HTMLElement
    const streakCard = screen.getByText('EN İYİ SERİ').parentElement?.parentElement as HTMLElement

    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('sm:grid-cols-6')
    expect(xpCard.className).toContain('col-span-2')
    expect(streakCard.className).toContain('col-span-1')
  })
})

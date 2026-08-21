import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatsGrid } from '../stats-grid'

const STATS = [
  { label: 'COIN', value: 151, icon: '🪙', color: 'gold' },
  { label: 'OYUN', value: 40, icon: '🎮', color: 'blue' },
  { label: 'BAŞARI', value: '%45', icon: '🎯', color: 'green' },
  { label: 'EN İYİ SERİ', value: 3, icon: '🔥', color: 'orange' },
]

describe('StatsGrid', () => {
  test('dört ikincil metriği dengeli biçimde gösterir', () => {
    render(<StatsGrid stats={STATS} />)

    for (const stat of STATS) {
      expect(screen.getByText(stat.label)).toBeInTheDocument()
    }
  })

  test('uygulama kabuğunda tüm ekranlarda 2x2 yerleşim kullanır', () => {
    const { container } = render(<StatsGrid stats={STATS} />)
    const grid = container.firstElementChild as HTMLElement
    const streakCard = screen.getByText('EN İYİ SERİ').parentElement?.parentElement as HTMLElement

    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).not.toContain('sm:grid-cols-4')
    expect(streakCard.className).toContain('min-h-[5.25rem]')
  })
})

/**
 * Bilge Arena: TopicsPanel (Konu Gücü) — tam genişlik yatay bant.
 * Responsive grid sınıfları + eşik renkleri + bar genişliği.
 */

import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TopicsPanel } from '../topics-panel'

const TOPICS = [
  { label: 'Cebir', percentage: 85 },
  { label: 'Denklemler', percentage: 50 },
  { label: 'Geometri', percentage: 20 },
  { label: 'Veri', percentage: 0 },
]

describe('TopicsPanel', () => {
  test('tüm konuları etiket + yüzde ile listeler', () => {
    render(<TopicsPanel topics={TOPICS} />)
    for (const t of TOPICS) {
      expect(screen.getByText(t.label)).toBeInTheDocument()
      expect(screen.getByText(`%${t.percentage}`)).toBeInTheDocument()
    }
  })

  test('yatay bant: responsive grid sınıfları (2/3/4 sütun)', () => {
    const { container } = render(<TopicsPanel topics={TOPICS} />)
    const grid = container.querySelector('.grid') as HTMLElement
    expect(grid).not.toBeNull()
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('sm:grid-cols-3')
    expect(grid.className).toContain('lg:grid-cols-4')
  })

  test('eşik renkleri: başlanmamış konu nötr, diğerleri başarı düzeyine göre', () => {
    render(<TopicsPanel topics={TOPICS} />)
    expect(screen.getByText('%85')).toHaveStyle({ color: 'var(--growth)' })
    expect(screen.getByText('%50')).toHaveStyle({ color: 'var(--reward)' })
    expect(screen.getByText('%20')).toHaveStyle({ color: 'var(--urgency)' })
    expect(screen.getByText('%0')).toHaveStyle({ color: '#94a3b8' })
  })

  test('bar genişliği yüzdeye eşit', () => {
    const { container } = render(<TopicsPanel topics={[{ label: 'Cebir', percentage: 42 }]} />)
    const bar = container.querySelector('.transition-\\[width\\]') as HTMLElement
    expect(bar.style.width).toBe('42%')
  })

  test('başlık bandı görünür', () => {
    render(<TopicsPanel topics={TOPICS} />)
    expect(screen.getByText('KONU GUCU')).toBeInTheDocument()
  })
})

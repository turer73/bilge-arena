import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ArenaExploreGrid } from '../arena-explore-grid'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const PUBLIC_ITEMS = [
  ['Bil ve Fethet', '/arena/fethet'],
  ['Kule Modu', '/arena/kule'],
  ['Soru Gönder', '/arena/soru-gonder'],
  ['Mağaza', '/arena/magaza'],
] as const

describe('ArenaExploreGrid', () => {
  test.each(PUBLIC_ITEMS)('%s kartını doğru rotaya bağlar', (name, href) => {
    render(<ArenaExploreGrid />)
    expect(screen.getByRole('link', { name: new RegExp(name, 'i') })).toHaveAttribute('href', href)
  })

  test('sınıf özelliği kapalıyken dört kartlı düzeni kullanır', () => {
    render(<ArenaExploreGrid />)
    expect(screen.queryByRole('link', { name: /Sınıflarım/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('arena-explore-grid')).toHaveClass('lg:grid-cols-4')
  })

  test('sınıf özelliği açıkken pilot kartını ve beş kartlı düzeni gösterir', () => {
    render(<ArenaExploreGrid classroomEnabled />)
    expect(screen.getByRole('link', { name: /Sınıflarım/i })).toHaveAttribute('href', '/arena/sinif')
    expect(screen.getByTestId('arena-explore-grid')).toHaveClass('sm:grid-cols-3', 'lg:grid-cols-5')
  })

  test('kurum takibi yalnız ayrı feature flag ile görünür', () => {
    const { rerender } = render(<ArenaExploreGrid />)
    expect(screen.queryByRole('link', { name: /Kurum Takibi/i })).not.toBeInTheDocument()
    rerender(<ArenaExploreGrid institutionEnabled />)
    expect(screen.getByRole('link', { name: /Kurum Takibi/i })).toHaveAttribute('href', '/arena/kurum')
    expect(screen.getByTestId('arena-explore-grid')).toHaveClass('sm:grid-cols-3', 'lg:grid-cols-5')
  })

  test('sınıf ve kurum kartları birlikte altı kartlı masaüstü düzeni kullanır', () => {
    render(<ArenaExploreGrid classroomEnabled institutionEnabled />)
    expect(screen.getByTestId('arena-explore-grid')).toHaveClass('sm:grid-cols-3', 'lg:grid-cols-6')
  })
})

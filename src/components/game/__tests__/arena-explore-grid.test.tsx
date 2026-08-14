import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch
  })

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

  test('kurum takibi yalnız ayrı feature flag ve aktif üyelikle görünür', async () => {
    const { rerender } = render(<ArenaExploreGrid />)
    expect(screen.queryByRole('link', { name: /Kurum Takibi/i })).not.toBeInTheDocument()
    rerender(<ArenaExploreGrid institutionEnabled />)
    await waitFor(() => expect(screen.getByRole('link', { name: /Kurum Takibi/i })).toHaveAttribute('href', '/arena/kurum'))
    expect(global.fetch).toHaveBeenCalledWith('/api/institution/workspace', expect.objectContaining({ cache: 'no-store' }))
    expect(screen.getByTestId('arena-explore-grid')).toHaveClass('sm:grid-cols-3', 'lg:grid-cols-5')
  })

  test('üyeliği olmayan normal kullanıcıda kurum kartını gizler', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as unknown as typeof fetch
    render(<ArenaExploreGrid institutionEnabled />)
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    expect(screen.queryByRole('link', { name: /Kurum Takibi/i })).not.toBeInTheDocument()
    expect(screen.getByTestId('arena-explore-grid')).toHaveClass('lg:grid-cols-4')
  })

  test('sınıf ve kurum kartları birlikte altı kartlı masaüstü düzeni kullanır', async () => {
    render(<ArenaExploreGrid classroomEnabled institutionEnabled />)
    await waitFor(() => expect(screen.getByRole('link', { name: /Kurum Takibi/i })).toBeInTheDocument())
    expect(screen.getByTestId('arena-explore-grid')).toHaveClass('sm:grid-cols-3', 'lg:grid-cols-6')
  })
})

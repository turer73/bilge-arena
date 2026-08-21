/**
 * Bilge Arena: BottomNav (mobil alt tab-bar) testleri
 *
 * Kapsam: 5 sekme render, aktiflik (activeOverride + usePathname),
 *   /arena tam-eslesme guard'i, alt-rota startsWith, aria-current.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// usePathname mock (hoisted — vi.mock factory'den once tanimlanmali)
const mockUsePathname = vi.hoisted(() => vi.fn<() => string>())
vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
// next/link → düz <a> (jsdom'da app-router context gerektirmesin)
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import { BottomNav } from '../bottom-nav'

const TABS = ['Öğren', 'Pratik', 'Arena', 'Lig', 'Profil']

function linkFor(label: string): HTMLAnchorElement {
  return screen.getByText(label).closest('a') as HTMLAnchorElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUsePathname.mockReturnValue('/arena')
})

describe('BottomNav', () => {
  test('5 sekmeyi dogru href ile render eder', () => {
    render(<BottomNav />)
    for (const t of TABS) expect(screen.getByText(t)).toBeInTheDocument()
    expect(linkFor('Öğren')).toHaveAttribute('href', '/arena')
    expect(linkFor('Pratik')).toHaveAttribute('href', '/arena/calisma')
    expect(linkFor('Arena')).toHaveAttribute('href', '/oda')
    expect(linkFor('Lig')).toHaveAttribute('href', '/arena/siralama')
    expect(linkFor('Profil')).toHaveAttribute('href', '/arena/profil')
  })

  test('masaustunde gizli (md:hidden)', () => {
    render(<BottomNav />)
    const nav = screen.getByRole('navigation', { name: /mobil gezinme/i })
    expect(nav.className).toContain('md:hidden')
    expect(nav.style.minHeight).toBe('calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))')
    expect(linkFor('Öğren').className).toContain('min-h-12')
  })

  test('activeOverride="learn" → sadece Öğren aria-current', () => {
    render(<BottomNav activeOverride="learn" />)
    expect(linkFor('Öğren')).toHaveAttribute('aria-current', 'page')
    expect(linkFor('Pratik')).not.toHaveAttribute('aria-current')
    expect(linkFor('Arena')).not.toHaveAttribute('aria-current')
    expect(linkFor('Lig')).not.toHaveAttribute('aria-current')
    expect(linkFor('Profil')).not.toHaveAttribute('aria-current')
  })

  test('usePathname=/arena → Öğren aktif (tam eslesme)', () => {
    mockUsePathname.mockReturnValue('/arena')
    render(<BottomNav />)
    expect(linkFor('Öğren')).toHaveAttribute('aria-current', 'page')
  })

  test('usePathname=/arena/siralama → Lig aktif, Öğren DEGIL (tam-eslesme guard)', () => {
    mockUsePathname.mockReturnValue('/arena/siralama')
    render(<BottomNav />)
    expect(linkFor('Lig')).toHaveAttribute('aria-current', 'page')
    // /arena yalnizca tam eslesmede aktif olmali — alt rotada degil
    expect(linkFor('Öğren')).not.toHaveAttribute('aria-current')
  })

  test('usePathname=/oda/kod → Arena aktif (startsWith)', () => {
    mockUsePathname.mockReturnValue('/oda/kod')
    render(<BottomNav />)
    expect(linkFor('Arena')).toHaveAttribute('aria-current', 'page')
  })

  test('activeOverride usePathname\'i ezer', () => {
    mockUsePathname.mockReturnValue('/arena/profil')
    render(<BottomNav activeOverride="leaderboard" />)
    expect(linkFor('Lig')).toHaveAttribute('aria-current', 'page')
    expect(linkFor('Profil')).not.toHaveAttribute('aria-current')
  })
})

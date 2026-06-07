/**
 * Bilge Arena: BottomNav (mobil alt tab-bar) testleri
 *
 * Kapsam: 4 sekme render, aktiflik (activeOverride + usePathname),
 *   /arena tam-eslesme guard'i, alt-rota startsWith, aria-current.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

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

const TABS = ['Anasayfa', 'Arena', 'Sıralama', 'Profil']

function linkFor(label: string): HTMLAnchorElement {
  return screen.getByText(label).closest('a') as HTMLAnchorElement
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUsePathname.mockReturnValue('/arena')
})

describe('BottomNav', () => {
  test('4 sekmeyi dogru href ile render eder', () => {
    render(<BottomNav />)
    for (const t of TABS) expect(screen.getByText(t)).toBeInTheDocument()
    expect(linkFor('Anasayfa')).toHaveAttribute('href', '/arena')
    expect(linkFor('Arena')).toHaveAttribute('href', '/oda')
    expect(linkFor('Sıralama')).toHaveAttribute('href', '/arena/siralama')
    expect(linkFor('Profil')).toHaveAttribute('href', '/arena/profil')
  })

  test('masaustunde gizli (md:hidden)', () => {
    render(<BottomNav />)
    const nav = screen.getByRole('navigation', { name: /mobil gezinme/i })
    expect(nav.className).toContain('md:hidden')
  })

  test('activeOverride="lobby" → sadece Anasayfa aria-current', () => {
    render(<BottomNav activeOverride="lobby" />)
    expect(linkFor('Anasayfa')).toHaveAttribute('aria-current', 'page')
    expect(linkFor('Arena')).not.toHaveAttribute('aria-current')
    expect(linkFor('Sıralama')).not.toHaveAttribute('aria-current')
    expect(linkFor('Profil')).not.toHaveAttribute('aria-current')
  })

  test('usePathname=/arena → Anasayfa aktif (tam eslesme)', () => {
    mockUsePathname.mockReturnValue('/arena')
    render(<BottomNav />)
    expect(linkFor('Anasayfa')).toHaveAttribute('aria-current', 'page')
  })

  test('usePathname=/arena/siralama → Siralama aktif, Anasayfa DEGIL (tam-eslesme guard)', () => {
    mockUsePathname.mockReturnValue('/arena/siralama')
    render(<BottomNav />)
    expect(linkFor('Sıralama')).toHaveAttribute('aria-current', 'page')
    // /arena yalnizca tam eslesmede aktif olmali — alt rotada degil
    expect(linkFor('Anasayfa')).not.toHaveAttribute('aria-current')
  })

  test('usePathname=/oda/kod → Arena aktif (startsWith)', () => {
    mockUsePathname.mockReturnValue('/oda/kod')
    render(<BottomNav />)
    expect(linkFor('Arena')).toHaveAttribute('aria-current', 'page')
  })

  test('activeOverride usePathname\'i ezer', () => {
    mockUsePathname.mockReturnValue('/arena/profil')
    render(<BottomNav activeOverride="leaderboard" />)
    expect(linkFor('Sıralama')).toHaveAttribute('aria-current', 'page')
    expect(linkFor('Profil')).not.toHaveAttribute('aria-current')
  })
})

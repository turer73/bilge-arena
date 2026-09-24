/**
 * Bilge Arena: (player) layout — /oda dahil tum player rotalarinda alt nav (BottomNav)
 * gosterilmeli. (Regresyon: BottomNav yalnizca arena layout'taydi, /oda'da kayboluyordu.)
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mockUsePathname = vi.hoisted(() => vi.fn<() => string>(() => '/oda'))
vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/layout/navbar', () => ({ Navbar: () => <nav data-testid="desktop-navbar">Masaüstü gezinmesi</nav> }))
vi.mock('@/components/academy/academy-tablet-nav', () => ({ AcademyTabletNav: ({ active }: { active: string }) => <nav data-testid="tablet-navbar" data-active={active}>Tablet gezinmesi</nav> }))

import PlayerLayout from '../layout'

describe('(player) layout', () => {
  test('alt nav (BottomNav) render eder + children gosterir', () => {
    render(<PlayerLayout><div>oda içeriği</div></PlayerLayout>)
    expect(screen.getByRole('navigation', { name: /mobil gezinme/i })).toBeInTheDocument()
    expect(screen.getByText('oda içeriği')).toBeInTheDocument()
  })

  test('/oda yolunda "Arena" sekmesi aktif', () => {
    mockUsePathname.mockReturnValue('/oda')
    render(<PlayerLayout><div>x</div></PlayerLayout>)
    const arenaLink = screen.getByText('Arena').closest('a')
    expect(arenaLink).toHaveAttribute('aria-current', 'page')
  })

  test('tablet ve masaustunu Bilge Arena akademi kabuguna baglar', () => {
    const { container } = render(<PlayerLayout><div>x</div></PlayerLayout>)
    expect(container.querySelector('[data-room-shell]')).toHaveClass('md:bg-transparent')
    expect(container.querySelector('[data-player-main]')).toHaveClass('md:max-w-[1180px]', 'lg:pt-[calc(var(--navbar-h)+2rem)]')
    expect(screen.getByTestId('desktop-navbar')).toBeInTheDocument()
    expect(container.querySelector('[data-player-main]')).toHaveClass('md:scroll-pb-0', 'md:pb-8')
    expect(screen.getByTestId('tablet-navbar')).toHaveAttribute('data-active', 'rooms')
  })
})

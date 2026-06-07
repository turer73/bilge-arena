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
})

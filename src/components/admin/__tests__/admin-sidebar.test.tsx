/**
 * Bilge Arena: AdminSidebar — mobil drawer davranisi
 * (Onceden sabit 220px sidebar mobilde ekranin yarisini yiyordu; artik off-canvas
 *  drawer + hamburger + backdrop, lg+'de sabit.)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockUsePathname = vi.hoisted(() => vi.fn<() => string>(() => '/admin'))
vi.mock('next/navigation', () => ({ usePathname: mockUsePathname }))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))
vi.mock('@/components/layout/logo', () => ({ Logo: () => <div data-testid="logo" /> }))

import { AdminSidebar } from '../admin-sidebar'

const asideEl = () => document.querySelector('aside') as HTMLElement
const backdropEl = () => document.querySelector('[class*="bg-black"]')

beforeEach(() => {
  vi.clearAllMocks()
  mockUsePathname.mockReturnValue('/admin')
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ permissions: [], roles: [] }),
  }) as unknown as typeof fetch
})

describe('AdminSidebar (mobil drawer)', () => {
  test('nav + hamburger render; varsayilan kapali (off-canvas), lg+ sabit', () => {
    render(<AdminSidebar />)
    expect(screen.getByRole('button', { name: /menüyü aç/i })).toBeInTheDocument()
    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Kullanıcılar')).toBeInTheDocument()
    // kapali: mobilde off-canvas; lg'de her zaman gorunur
    expect(asideEl().className).toContain('-translate-x-full')
    expect(asideEl().className).toContain('lg:translate-x-0')
    expect(backdropEl()).toBeNull()
  })

  test('hamburger tikla -> drawer acilir (off-canvas kalkar + backdrop)', () => {
    render(<AdminSidebar />)
    fireEvent.click(screen.getByRole('button', { name: /menüyü aç/i }))
    expect(asideEl().className).not.toContain('-translate-x-full')
    expect(backdropEl()).not.toBeNull()
  })

  test('backdrop tikla -> kapanir', () => {
    render(<AdminSidebar />)
    fireEvent.click(screen.getByRole('button', { name: /menüyü aç/i }))
    fireEvent.click(backdropEl() as Element)
    expect(asideEl().className).toContain('-translate-x-full')
    expect(backdropEl()).toBeNull()
  })

  test('kapat butonu (X) drawer\'i kapatir', () => {
    render(<AdminSidebar />)
    fireEvent.click(screen.getByRole('button', { name: /menüyü aç/i }))
    fireEvent.click(screen.getByRole('button', { name: /menüyü kapat/i }))
    expect(asideEl().className).toContain('-translate-x-full')
  })
})

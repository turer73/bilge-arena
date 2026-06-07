/**
 * Bilge Arena: ThemeToggle — popover davranisi
 * (Onceden 6 renk inline navbar'da yer kapliyordu; artik tek tetikleyici + acilir liste.)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const mockSetTheme = vi.hoisted(() => vi.fn())
const mockTheme = vi.hoisted(() => ({ value: 'dark' as string }))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => ({ theme: mockTheme.value, setTheme: mockSetTheme }),
  DARK_THEMES: new Set(['dark', 'okyanus', 'orman', 'gunbatimi', 'mor-gece']),
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => ({ user: null, profile: null }) }))

import { ThemeToggle } from '../theme-toggle'

beforeEach(() => {
  vi.clearAllMocks()
  mockTheme.value = 'dark'
  localStorage.clear()
})

describe('ThemeToggle (popover)', () => {
  test('varsayilan kapali: tetikleyici var, liste (menu) YOK', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: /tema seç/i })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    // 6 renk inline durmamali (yer kaplamasin) — sadece 1 tetikleyici buton
    expect(screen.queryByText('Mor Gece')).not.toBeInTheDocument()
  })

  test('tetikleyiciye tikla → popover acilir, 6 tema listelenir', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /tema seç/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Gece Mavisi')).toBeInTheDocument()
    expect(screen.getByText('Mor Gece')).toBeInTheDocument()
    expect(screen.getByText('Gün Işığı')).toBeInTheDocument()
  })

  test('bir tema seç → setTheme cagrilir + popover kapanir', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /tema seç/i }))
    fireEvent.click(screen.getByText('Mor Gece'))
    expect(mockSetTheme).toHaveBeenCalledWith('mor-gece')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  test('aktif tema menuitemradio aria-checked', () => {
    mockTheme.value = 'orman'
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('button', { name: /tema seç/i }))
    const active = screen.getByRole('menuitemradio', { checked: true })
    expect(active).toHaveTextContent('Kadim Orman')
  })
})

/**
 * Bilge Arena: ThemeToggle — popover davranisi
 * (Onceden 6 renk inline navbar'da yer kapliyordu; artik tek tetikleyici + acilir liste.)
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent } from '@testing-library/react'

const mockSetTheme = vi.hoisted(() => vi.fn())
const mockTheme = vi.hoisted(() => ({ value: 'dark' as string }))
const auth = vi.hoisted(() => ({ user: null as {id:string} | null, profile: null as {preferred_theme:string; selected_nameplate?:string} | null, setProfile:vi.fn() }))

vi.mock('@/stores/ui-store', () => ({
  useUIStore: () => ({ theme: mockTheme.value, setTheme: mockSetTheme }),
  DARK_THEMES: new Set(['dark', 'okyanus', 'orman', 'gunbatimi', 'mor-gece']),
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: Object.assign(() => auth, {getState:() => auth}) }))

import { ThemeToggle } from '../theme-toggle'

beforeEach(() => {
  vi.clearAllMocks()
  mockTheme.value = 'dark'
  localStorage.clear()
  auth.user = null
  auth.profile = null
  auth.setProfile.mockImplementation((profile) => { auth.profile = profile })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('ThemeToggle personalization variants', () => {
  test('sync-only restores the saved theme without rendering a header control', () => {
    localStorage.setItem('bilge-theme', 'orman')
    const { container } = render(<ThemeToggle variant="sync-only" />)
    expect(container).toBeEmptyDOMElement()
    expect(mockSetTheme).toHaveBeenCalledWith('orman')
  })

  test('panel exposes six native radio choices and does not save a guest choice to the API', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<ThemeToggle variant="panel" />)
    expect(screen.getByRole('group', {name:'Renk teması'})).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(6)
    expect(screen.queryByRole('button', {name:/Tema seç/})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', {name:'Renk teması: Mor Gece'}))
    expect(mockSetTheme).toHaveBeenCalledWith('mor-gece')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  test('panel keeps the existing debounced signed-in preference endpoint', async () => {
    vi.useFakeTimers()
    auth.user = {id:'student'}
    const fetchMock = vi.fn().mockResolvedValue({ok:true})
    vi.stubGlobal('fetch', fetchMock)
    render(<ThemeToggle variant="panel" />)
    fireEvent.click(screen.getByRole('radio', {name:'Renk teması: Kadim Orman'}))
    fireEvent.click(screen.getByRole('radio', {name:'Renk teması: Mor Gece'}))
    expect(fetchMock).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({
      method:'PATCH', body:JSON.stringify({preferred_theme:'mor-gece'}),
    }))
  })

  test('returning to the academy preserves the new theme and does not clobber other profile preferences', async () => {
    vi.useFakeTimers()
    auth.user = {id:'student'}
    auth.profile = {preferred_theme:'dark'}
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ok:true}))
    const {unmount} = render(<ThemeToggle variant="panel" />)
    // Another preference may have changed since this component rendered.
    auth.profile = {...auth.profile, selected_nameplate:'gece'}
    fireEvent.click(screen.getByRole('radio', {name:'Renk teması: Mor Gece'}))
    expect(auth.profile).toEqual({preferred_theme:'mor-gece', selected_nameplate:'gece'})
    unmount()
    mockSetTheme.mockClear()
    render(<ThemeToggle variant="sync-only" />)
    expect(mockSetTheme).toHaveBeenLastCalledWith('mor-gece')
    await act(async () => { vi.advanceTimersByTime(600) })
  })

  test('a queued preference is not written to a different signed-in account', async () => {
    vi.useFakeTimers()
    auth.user = {id:'student'}
    const fetchMock = vi.fn().mockResolvedValue({ok:true})
    vi.stubGlobal('fetch', fetchMock)
    render(<ThemeToggle variant="panel" />)
    fireEvent.click(screen.getByRole('radio', {name:'Renk teması: Mor Gece'}))
    auth.user = {id:'another-student'}
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(fetchMock).not.toHaveBeenCalled()
  })
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

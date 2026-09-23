/**
 * Bilge Arena Oda: PublicRoomList component tests
 * Sprint 2A Task 3
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { mockRouterPush, mockRouterRefresh } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, refresh: mockRouterRefresh }),
}))

import { PublicRoomList } from '../PublicRoomList'
import type { PublicRoomCard } from '@/lib/rooms/server-fetch'

const sampleRooms: PublicRoomCard[] = [
  {
    id: 'r1',
    code: 'PUBA12',
    title: 'Genel Kültür Düellosu',
    category: 'genel-kultur',
    difficulty: 3,
    question_count: 10,
    max_players: 6,
    member_count: 2,
    created_at: '2026-04-30T10:00:00Z',
  },
  {
    id: 'r2',
    code: 'MAT123',
    title: 'Matematik Yarışması',
    category: 'matematik',
    difficulty: 4,
    question_count: 15,
    max_players: 4,
    member_count: 1,
    created_at: '2026-04-30T11:00:00Z',
  },
]

describe('PublicRoomList', () => {
  test('1) rooms render: title + kategori + uye sayisi', () => {
    render(
      <PublicRoomList result={{ status: 'success', rooms: sampleRooms }} />,
    )
    expect(screen.getByText('Genel Kültür Düellosu')).toBeInTheDocument()
    expect(screen.getByText('Matematik Yarışması')).toBeInTheDocument()
    // Uye sayisi: 2/6
    expect(screen.getByText('2/6')).toBeInTheDocument()
    expect(screen.getByText('1/4')).toBeInTheDocument()
  })

  test('2) empty rooms -> açık oda yok + Oda Kur CTA', () => {
    render(<PublicRoomList result={{ status: 'success', rooms: [] }} />)
    expect(
      screen.getByText(/Şu anda katılabileceğin açık oda yok/i),
    ).toBeInTheDocument()
    // Yeni Oda link
    const cta = screen.getByText(/^Oda Kur$/i)
    expect(cta).toBeInTheDocument()
    expect(cta.closest('a')?.getAttribute('href')).toBe('/oda/yeni')
  })

  test('3) kategori filter degistirildiginde router.push tetiklenir', () => {
    render(
      <PublicRoomList result={{ status: 'success', rooms: sampleRooms }} />,
    )
    const select = screen.getByLabelText(/Kategori/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'matematik' } })
    expect(mockRouterPush).toHaveBeenCalledWith(
      '/oda?tab=public&cat=matematik',
    )
  })

  test('4) selectedCategory prop ile select.value sync', () => {
    render(
      <PublicRoomList
        result={{ status: 'success', rooms: sampleRooms }}
        selectedCategory="cografya"
      />,
    )
    const select = screen.getByLabelText(/Kategori/i) as HTMLSelectElement
    expect(select.value).toBe('cografya')
  })

  test('5) Bos kategori secimi -> tab=public (cat YOK)', () => {
    render(
      <PublicRoomList
        result={{ status: 'success', rooms: sampleRooms }}
        selectedCategory="matematik"
      />,
    )
    const select = screen.getByLabelText(/Kategori/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: '' } })
    expect(mockRouterPush).toHaveBeenCalledWith('/oda?tab=public')
  })

  test('6) oda kartina tiklanabilir Link /oda/[code]', () => {
    render(
      <PublicRoomList result={{ status: 'success', rooms: sampleRooms }} />,
    )
    const link = screen.getByLabelText('Genel Kültür Düellosu odasına katıl')
    expect(link.getAttribute('href')).toBe('/oda/PUBA12')
  })

  test('7) Codex P3 #1: kategori slug→label gosterimi (raw slug DEGIL)', () => {
    render(
      <PublicRoomList result={{ status: 'success', rooms: sampleRooms }} />,
    )
    // 'genel-kultur' yerine 'Genel Kültür' gorunmeli
    expect(screen.queryByText(/genel-kultur · Zorluk/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Genel Kültür · Zorluk 3\/5 · 10 soru/i)).toBeInTheDocument()
    expect(screen.getByText(/Matematik · Zorluk 4\/5 · 15 soru/i)).toBeInTheDocument()
  })

  test('8) Codex P3 #2: kategori secenekleri ROOM_CATEGORIES helper ile uyumlu', () => {
    const { container } = render(
      <PublicRoomList result={{ status: 'success', rooms: sampleRooms }} />,
    )
    const options = container.querySelectorAll<HTMLOptionElement>(
      'select[name="category"] option',
    )
    // 1 boş + 10 kategori = 11 option
    expect(options).toHaveLength(11)
    // Ilk option boş ('Tüm Kategoriler')
    expect(options[0].value).toBe('')
    expect(options[0].textContent).toMatch(/Tüm Kategoriler/i)
    // 2-11. options: ROOM_CATEGORIES + slugToLabel (dropdown'da insan-okunabilir)
    expect(options[1].value).toBe('genel-kultur')
    expect(options[1].textContent).toBe('Genel Kültür')
    expect(options[5].value).toBe('matematik')
    expect(options[5].textContent).toBe('Matematik')
  })

  test('9) load error -> retry action, not empty-state copy', () => {
    render(
      <PublicRoomList result={{ status: 'error' }} selectedCategory="matematik" />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/yüklenemedi/i)
    expect(
      screen.queryByText(/Şu anda katılabileceğin açık oda yok/i),
    ).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Tekrar dene/i }))
    expect(mockRouterRefresh).toHaveBeenCalledOnce()
  })
})

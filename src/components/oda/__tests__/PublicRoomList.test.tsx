/**
 * Bilge Arena Oda: PublicRoomList component tests
 * Sprint 2A Task 3
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush }),
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
    render(<PublicRoomList rooms={sampleRooms} />)
    expect(screen.getByText('Genel Kültür Düellosu')).toBeInTheDocument()
    expect(screen.getByText('Matematik Yarışması')).toBeInTheDocument()
    // Uye sayisi: 2/6
    expect(screen.getByText('2/6')).toBeInTheDocument()
    expect(screen.getByText('1/4')).toBeInTheDocument()
  })

  test('2) empty rooms -> "Şu anda aktif açık oda yok" + Yeni Oda CTA', () => {
    render(<PublicRoomList rooms={[]} />)
    expect(
      screen.getByText(/Şu anda aktif açık oda yok/i),
    ).toBeInTheDocument()
    // Yeni Oda link
    const cta = screen.getByText(/\+ Yeni Oda/i)
    expect(cta).toBeInTheDocument()
    expect(cta.closest('a')?.getAttribute('href')).toBe('/oda/yeni')
  })

  test('3) kategori filter degistirildiginde router.push tetiklenir', () => {
    render(<PublicRoomList rooms={sampleRooms} />)
    const select = screen.getByLabelText(/Kategori/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'matematik' } })
    expect(mockRouterPush).toHaveBeenCalledWith(
      '/oda?tab=public&cat=matematik',
    )
  })

  test('4) selectedCategory prop ile select.value sync', () => {
    render(
      <PublicRoomList rooms={sampleRooms} selectedCategory="cografya" />,
    )
    const select = screen.getByLabelText(/Kategori/i) as HTMLSelectElement
    expect(select.value).toBe('cografya')
  })

  test('5) Bos kategori secimi -> tab=public (cat YOK)', () => {
    render(
      <PublicRoomList rooms={sampleRooms} selectedCategory="matematik" />,
    )
    const select = screen.getByLabelText(/Kategori/i) as HTMLSelectElement
    fireEvent.change(select, { target: { value: '' } })
    expect(mockRouterPush).toHaveBeenCalledWith('/oda?tab=public')
  })

  test('6) oda kartina tiklanabilir Link /oda/[code]', () => {
    render(<PublicRoomList rooms={sampleRooms} />)
    const link = screen.getByLabelText('Genel Kültür Düellosu odasına katıl')
    expect(link.getAttribute('href')).toBe('/oda/PUBA12')
  })
})

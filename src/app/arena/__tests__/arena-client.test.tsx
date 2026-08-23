/**
 * ArenaClient tek duyarlı öğrenme yolu kabuğu sözleşmesi.
 *
 * Aynı içerik mobil, tablet ve masaüstünde render edilir; ekran genişliği
 * yalnız yerleşimi değiştirir, veri ve eylem modelini değiştirmez.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

const mockAuth = vi.hoisted(() => ({
  value: { user: null as { id: string } | null, profile: null as Record<string, unknown> | null },
}))
const mockQuestState = vi.hoisted(() => ({ value: [] as unknown[] }))

vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => mockAuth.value }))
vi.mock('@/lib/hooks/use-daily-quests', () => ({
  useDailyQuests: () => ({ quests: mockQuestState.value, claimXP: vi.fn() }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import ArenaClient from '../arena-client'

const UUID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.value = { user: null, profile: null }
  mockQuestState.value = []
  localStorage.clear()
  localStorage.setItem('ba-coach-seen:guest', new Date().toDateString())
  localStorage.setItem(`ba-coach-seen:${UUID}`, new Date().toDateString())
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/institution/workspace')) return { ok: false, json: async () => ({}) } as Response
    if (url.includes('/api/profile/topic-strengths')) return { ok: true, json: async () => ({ topics: [] }) } as Response
    return { ok: false, json: async () => ({}) } as Response
  }) as typeof fetch
})

describe('ArenaClient duyarlı öğrenme ekranı', () => {
  test('ekran genişliğinden bağımsız olarak öğrenme yolu ve konu derin bağlantılarını render eder', () => {
    const { container } = render(<ArenaClient />)

    expect(screen.getByRole('heading', { name: 'Matematik Yolu' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Öğrenme yolu' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sayılar dersini aç' }))
      .toHaveAttribute('href', '/arena/matematik?category=sayilar')
    expect(screen.getByRole('link', { name: /Mağaza/ })).toHaveAttribute('href', '/arena/magaza')

    const responsiveGrid = container.querySelector('[data-responsive-arena-grid]')
    expect(responsiveGrid).toHaveClass('md:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]')
  })

  test('profil kaynaklarını ve günlük soru hedefini aynı kabuğa aktarır', () => {
    mockAuth.value = {
      user: { id: UUID },
      profile: {
        total_xp: 2340,
        current_streak: 12,
        coin_balance: 480,
        username: 'arenaci',
        exam_type: 'yks',
      },
    }
    mockQuestState.value = [{
      id: 'q1', current_value: 3, is_completed: false, xp_claimed: false,
      quest: { title: '5 soru çöz', target_value: 5, quest_type: 'correct_answers', xp_reward: 50 },
    }]

    render(<ArenaClient />)

    expect(screen.getByLabelText('Günlük seri: 12')).toBeInTheDocument()
    expect(screen.getByLabelText('Altın: 480')).toBeInTheDocument()
    expect(screen.getByText('3 / 5 soru')).toBeInTheDocument()
  })

  test('LGS profilinde yalnız uygun dersleri gösterir', () => {
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 100, current_streak: 0, username: 'lgsci', exam_type: 'lgs' },
    }

    render(<ArenaClient />)

    expect(screen.getByRole('button', { name: 'Mat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Türkçe' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'YDT' })).not.toBeInTheDocument()
  })

  test('YKS profilinde İngilizce dahil tüm dersleri gösterir', () => {
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 100, current_streak: 0, username: 'yksci', exam_type: 'yks' },
    }

    render(<ArenaClient />)
    expect(screen.getByRole('button', { name: 'YDT' })).toBeInTheDocument()
  })

  test('kurum alanını yalnız etkin bayrak ve yetkili çalışma alanı yanıtıyla gösterir', async () => {
    const previous = process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED
    process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED = 'true'
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/institution/workspace')) return { ok: true, json: async () => ({}) } as Response
      return { ok: true, json: async () => ({ topics: [] }) } as Response
    }) as typeof fetch

    try {
      render(<ArenaClient />)
      expect(await screen.findByRole('link', { name: /Kurum paneli/ }))
        .toHaveAttribute('href', '/arena/kurum')
      await waitFor(() => expect(fetch).toHaveBeenCalledWith(
        '/api/institution/workspace',
        expect.objectContaining({ cache: 'no-store' }),
      ))
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED
      else process.env.NEXT_PUBLIC_INSTITUTION_TRACKING_ENABLED = previous
    }
  })
})

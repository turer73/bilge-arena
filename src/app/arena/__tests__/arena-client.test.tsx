/**
 * ArenaClient tek duyarlı öğrenme yolu kabuğu sözleşmesi.
 *
 * Aynı içerik mobil, tablet ve masaüstünde render edilir; ekran genişliği
 * yalnız yerleşimi değiştirir, veri ve eylem modelini değiştirmez.
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

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
import { useGameStore } from '@/stores/game-store'

const UUID = '11111111-1111-4111-8111-111111111111'

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.value = { user: null, profile: null }
  mockQuestState.value = []
  useGameStore.setState({ selectedExamRef: null })
  localStorage.clear()
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

  test('profil kaynaklarını ve günlük soru hedefini aynı kabuğa aktarır', async () => {
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

    await act(async () => { render(<ArenaClient />) })

    expect(screen.getByLabelText('Günlük seri: 12')).toBeInTheDocument()
    expect(screen.getByLabelText('Altın: 480')).toBeInTheDocument()
    expect(screen.getByText('3 / 5 soru')).toBeInTheDocument()
  })

  test('LGS profilinde yalnız uygun dersleri gösterir', async () => {
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 100, current_streak: 0, username: 'lgsci', exam_type: 'lgs' },
    }

    await act(async () => { render(<ArenaClient />) })

    expect(screen.getByRole('button', { name: 'Mat' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Türkçe' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'YDT' })).not.toBeInTheDocument()
  })

  test('YKS profilinde İngilizce dahil tüm dersleri gösterir', async () => {
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 100, current_streak: 0, username: 'yksci', exam_type: 'yks' },
    }

    await act(async () => { render(<ArenaClient />) })
    expect(screen.getByRole('button', { name: 'YDT' })).toBeInTheDocument()
  })

  test('profil turu degisince onceki sinavin gecersiz kapsamını varsayilana dondurur', async () => {
    useGameStore.setState({ selectedExamRef: 'LGS' })
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 100, current_streak: 0, username: 'yksci', exam_type: 'yks' },
    }

    render(<ArenaClient />)

    expect(screen.getByRole('button', { name: 'Mat' })).toBeInTheDocument()
    await waitFor(() => expect(useGameStore.getState().selectedExamRef).toBe('TYT'))
  })

  test('sinav turu belirlenmemis eski profilde secili kapsami korur', async () => {
    useGameStore.setState({ selectedExamRef: 'LGS' })
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 100, current_streak: 0, username: 'legacy', exam_type: null },
    }

    render(<ArenaClient />)

    expect(screen.getByRole('button', { name: 'Mat' })).toBeInTheDocument()
    await waitFor(() => expect(useGameStore.getState().selectedExamRef).toBe('LGS'))
  })

  test('AYT esit agirlik kapsaminda matematigi gosterir', async () => {
    useGameStore.setState({ selectedExamRef: 'AYT-EA' })
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 100, current_streak: 0, username: 'eaci', exam_type: 'yks' },
    }

    await act(async () => { render(<ArenaClient />) })
    expect(screen.getByRole('button', { name: 'Mat' })).toBeInTheDocument()
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

  test('ana plan gerçek API bağlamıyla yüklenir; ders/sınav değişince önceki plan görünmez', async () => {
    mockAuth.value = { user: { id: UUID }, profile: { exam_type: 'yks' } }
    const requests: string[] = []
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (!url.startsWith('/api/study/today')) return { ok: true, json: async () => ({ topics: [] }) } as Response
      requests.push(url)
      const params = new URL(url, 'http://localhost').searchParams
      const game = params.get('game')
      const examRef = params.get('exam_ref')
      const count = game === 'matematik' ? 15 : examRef === 'TYT' ? 12 : 8
      return { ok: true, json: async () => ({
        planDate: '2026-09-06', game, examRef,
        questions: Array.from({ length: count }, (_, i) => ({ id: `${game}-${i}` })),
        completedIds: [],
        items: Array.from({ length: count }, (_, i) => ({ questionId: `${game}-${i}`, position: i,
          slotType: 'current_target', sourceType: 'question', sourceLabel: 'Yeni konu', completed: false })),
        attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expiresAt: '2099-01-01T00:00:00Z',
      }) } as Response
    }) as typeof fetch
    render(<ArenaClient />)
    expect(await screen.findByRole('button', { name: 'Planı Başlat · 15 Soru' })).toBeInTheDocument()
    const primaryEntry = document.querySelector('[data-today-plan-primary]')!
    const secondaryGrid = document.querySelector('[data-responsive-arena-grid]')!
    expect(primaryEntry.compareDocumentPosition(secondaryGrid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Türkçe' }))
    expect(screen.queryByRole('button', { name: 'Planı Başlat · 15 Soru' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Planı Başlat · 12 Soru' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sınav kapsamını değiştir' }))
    fireEvent.click(screen.getByRole('button', { name: 'AYT Eşit Ağırlık' }))
    expect(screen.queryByRole('button', { name: 'Planı Başlat · 12 Soru' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Planı Başlat · 8 Soru' })).toBeInTheDocument()
    expect(requests).toEqual([
      '/api/study/today?game=matematik&exam_ref=TYT',
      '/api/study/today?game=turkce&exam_ref=TYT',
      '/api/study/today?game=turkce&exam_ref=AYT-EA',
    ])
  })
})

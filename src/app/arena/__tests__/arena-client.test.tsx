/**
 * Bilge Arena: ArenaClient (mobil home) testleri
 *
 * Kapsam: anon (login CTA) vs giris-yapilmis (XP bar + gunluk gorevler),
 *   sonraki-seviye / maks-seviye dali, mini siralama fetch + render (avatar img),
 *   Arena CTA, oyun grid'i.
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// auth-store + useDailyQuests hoisted mock state (test basina degisir)
const mockAuth = vi.hoisted(() => ({ value: { user: null as { id: string } | null, profile: null as Record<string, unknown> | null } }))
const mockQuestState = vi.hoisted(() => ({ value: [] as unknown[] }))
const mockClaim = vi.hoisted(() => vi.fn())

vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => mockAuth.value }))
vi.mock('@/lib/hooks/use-daily-quests', () => ({
  useDailyQuests: () => ({ quests: mockQuestState.value, claimXP: mockClaim }),
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

import ArenaClient from '../arena-client'

const UUID = '11111111-1111-4111-8111-111111111111'

function mockLeaderboardFetch(players: unknown[], myRank = 0) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ players, myRank }),
  }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.clearAllMocks()
  mockAuth.value = { user: null, profile: null }
  mockQuestState.value = []
  mockLeaderboardFetch([]) // varsayilan: bos siralama
})

describe('ArenaClient (mobil home)', () => {
  test('öğretmen sınıfı bağlantısını yalnız açık UI flag ile gösterir', () => {
    const previous = process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED
    try {
      delete process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED
      const { unmount } = render(<ArenaClient />)
      expect(screen.queryByRole('link', { name: /Sınıflarım/i })).not.toBeInTheDocument()
      unmount()

      process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED = 'true'
      render(<ArenaClient />)
      expect(screen.getByRole('link', { name: /Sınıflarım/i })).toHaveAttribute('href', '/arena/sinif')
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED
      else process.env.NEXT_PUBLIC_TEACHER_CLASSROOM_ENABLED = previous
    }
  })

  test('anon: login CTA + oyun grid + Arena CTA; XP bar/gorev YOK', async () => {
    render(<ArenaClient />)
    expect(screen.getByText(/ilerlemeyi kaydet/i)).toBeInTheDocument()
    expect(screen.getByText('Matematik')).toBeInTheDocument()
    expect(screen.getByText(/Arena.?da yarış/i)).toBeInTheDocument()
    const subjectGrid = screen.getByTestId('game-select-grid')
    const exploreGrid = screen.getByTestId('arena-explore-grid')
    expect(subjectGrid.compareDocumentPosition(exploreGrid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // XP bar (Sv.) ve gorev gosterilmemeli
    expect(screen.queryByText(/^Sv\./)).not.toBeInTheDocument()
  })

  test('giris: XP bar (Sv.2) + sonraki seviyeye kalan XP + gunluk gorev', () => {
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 2340, current_streak: 12, username: 'arenaci', avatar_url: null, coin_balance: 0 },
    }
    mockQuestState.value = [{
      id: 'q1', current_value: 3, is_completed: false, xp_claimed: false,
      quest: { title: '5 soru çöz', icon: '🎯', target_value: 5, quest_type: 'correct_answers', xp_reward: 50 },
    }]
    render(<ArenaClient />)
    expect(screen.getByText('arenaci')).toBeInTheDocument()
    // total_xp 2340 -> Cirak (Sv.2), sonraki Savasci (5000) -> 2.660 XP kaldi
    expect(screen.getByText('Sv.2')).toBeInTheDocument()
    expect(screen.getByText(/2\.660 XP/)).toBeInTheDocument()
    // gunluk gorev render (label ikon ile ayni span'de: "🎯 5 soru çöz")
    expect(screen.getByText(/5 soru çöz/)).toBeInTheDocument()
    expect(screen.getByText('GÜNLÜK GÖREV')).toBeInTheDocument()
  })

  test('exam_type=lgs -> oyun listesi filtreli (İngilizce/YDT gizli, Matematik var)', () => {
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 100, current_streak: 0, username: 'lgsci', avatar_url: null, exam_type: 'lgs' },
    }
    render(<ArenaClient />)
    expect(screen.getByText('Matematik')).toBeInTheDocument()
    expect(screen.getByText('Türkçe')).toBeInTheDocument()
    // İngilizce (wordquest, examTags=['YDT']) LGS'de gosterilmemeli
    expect(screen.queryByText('İngilizce')).not.toBeInTheDocument()
  })

  test('exam_type=yks -> tüm dersler (İngilizce dahil)', () => {
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 100, current_streak: 0, username: 'yksci', avatar_url: null, exam_type: 'yks' },
    }
    render(<ArenaClient />)
    expect(screen.getByText('Matematik')).toBeInTheDocument()
    expect(screen.getByText('İngilizce')).toBeInTheDocument()
  })

  test('maks seviye (Efsane): "Maksimum seviye" rozeti, sonraki-seviye metni yok', () => {
    mockAuth.value = {
      user: { id: UUID },
      profile: { total_xp: 60000, current_streak: 3, display_name: 'Efsane', avatar_url: null },
    }
    render(<ArenaClient />)
    expect(screen.getByText(/Maksimum seviye/i)).toBeInTheDocument()
    expect(screen.queryByText(/XP kaldı/i)).not.toBeInTheDocument()
  })

  test('mini siralama: fetch sonrasi oyuncular + gercek avatar (img)', async () => {
    mockAuth.value = { user: { id: UUID }, profile: { total_xp: 2340, current_streak: 1, username: 'Sen', avatar_url: null } }
    mockLeaderboardFetch([
      { rank: 1, name: 'zeynep', avatar_url: 'https://cdn.x/a.png', xp_earned: 9820, is_me: false },
      { rank: 2, name: 'Sen', avatar_url: null, xp_earned: 2340, is_me: true },
    ], 2)
    render(<ArenaClient />)
    await waitFor(() => expect(screen.getByText('HAFTALIK SIRA')).toBeInTheDocument())
    expect(screen.getByText('zeynep')).toBeInTheDocument()
    // avatar_url olan satir <img> render etmeli
    const img = document.querySelector('img[src="https://cdn.x/a.png"]')
    expect(img).not.toBeNull()
    // leaderboard fetch currentUserId ile cagrildi
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(expect.stringContaining(`currentUserId=${UUID}`))
  })
})

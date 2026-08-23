/**
 * Bilge Arena: ResultScreen — stat/streak gösterimi + dikey ortalama (mobil).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const quiz = vi.hoisted(() => ({
  value: {
    score: 8,
    questions: Array.from({ length: 10 }, () => ({})),
    answers: Array.from({ length: 10 }, () => ({})),
    xpEarned: 190,
    maxStreak: 5,
    lives: 3,
    livesEnabled: false,
  } as Record<string, unknown>,
}))

vi.mock('@/stores/quiz-store', () => ({ useQuizStore: () => quiz.value }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => ({ user: { id: 'u1' } }) }))
vi.mock('@/lib/hooks/use-guest-session', () => ({
  useGuestSession: () => ({ incrementQuizCount: vi.fn() }),
  computePromptLevel: () => 1,
}))
vi.mock('@/components/social/share-buttons', () => ({ ShareButtons: () => <div data-testid="share" /> }))
vi.mock('./signup-prompt-modal', () => ({ SignupPromptModal: () => null }))
vi.mock('@/lib/utils/plausible', () => ({ trackEvent: vi.fn() }))

import { ResultScreen } from '../result-screen'

beforeEach(() => {
  vi.clearAllMocks()
  quiz.value = {
    score: 8, questions: Array.from({ length: 10 }, () => ({})), answers: Array.from({ length: 10 }, () => ({})),
    xpEarned: 190, maxStreak: 5, lives: 3, livesEnabled: false,
  }
})

describe('ResultScreen', () => {
  test('8/10 + %80 + 190 XP + en yüksek seri 5 gösterir', () => {
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} />)
    expect(screen.getByText('8/10')).toBeInTheDocument()
    expect(screen.getByText('%80')).toBeInTheDocument()
    expect(screen.getByText('190')).toBeInTheDocument()
    expect(screen.getByText(/En yüksek seri: 5 soru doğru/)).toBeInTheDocument()
  })

  test('maxStreak < 3 ise seri banner gizli', () => {
    quiz.value = { ...quiz.value, maxStreak: 2 }
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} />)
    expect(screen.queryByText(/En yüksek seri/)).not.toBeInTheDocument()
  })

  test('mobilde dikeyde ortalanir, tablette genisler', () => {
    const { container } = render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('min-h-[calc(100dvh-8rem)]')
    expect(root.className).toContain('justify-center')
    expect(root.className).toContain('md:max-w-[720px]')
  })

  test('normal bitiş: Bilge Chan victory pose', () => {
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} />)
    expect(screen.getByAltText('Bilge Chan zafer işareti yapıyor')).toBeInTheDocument()
  })

  test('gameOver (canlar bitti): Bilge Chan sad pose', () => {
    quiz.value = { ...quiz.value, livesEnabled: true, lives: 0 }
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} />)
    expect(screen.getByAltText('Bilge Chan üzgün')).toBeInTheDocument()
  })

  // ─── Kazanilan altin ─────────────────────────────────

  test('kazanilan altini ve magaza baglantisini gosterir', () => {
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} coinsEarned={40} />)
    expect(screen.getByText(/\+40 altın kazandın/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mağaza/ })).toHaveAttribute('href', '/arena/magaza')
  })

  test('altin bilinmiyorken (oturum kaydi surerken/misafir) rozet hic cikmaz', () => {
    // Sonuc ekrani, oturum kaydi tamamlanmadan once render olur; o an null gelir.
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} coinsEarned={null} />)
    expect(screen.queryByText(/altın/)).not.toBeInTheDocument()
  })

  test('gunluk tavan dolu (0 altin): kazanim degil sinir mesaji gosterir', () => {
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} coinsEarned={0} />)
    expect(screen.getByText(/altın sınırına ulaştın/)).toBeInTheDocument()
    expect(screen.queryByText(/\+0 altın/)).not.toBeInTheDocument()
  })
})

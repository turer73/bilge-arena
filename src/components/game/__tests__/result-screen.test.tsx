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
vi.mock('@/components/social/share-buttons', () => ({
  ShareButtons: (props: Record<string, unknown>) => (
    <div data-testid="share">{JSON.stringify(props)}</div>
  ),
}))
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
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} saveStatus="saved" savedTotalXP={190} />)
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

  test.each([
    ['pending', 'Sonuçların güvenli biçimde kaydediliyor…'],
    ['failed', 'Sonuçlarının kaydı doğrulanamadı. XP ve altın kazanımın henüz doğrulanmadı.'],
    ['not_applicable', 'Bu turun doğrulanmış kaydı yok; ilerlemen kaydedilmedi.'],
  ] as const)('kayıt durumu %s ise başarı iddiası göstermez', (saveStatus, message) => {
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} saveStatus={saveStatus} />)
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.queryByText('Harika iş! İlerlemen kaydedildi.')).not.toBeInTheDocument()
  })

  test('saved durumunda server totalXP gösterilir', () => {
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} saveStatus="saved" savedTotalXP={7} savedCorrectCount={2} savedWrongCount={1} />)
    expect(screen.getByText('Harika iş! İlerlemen kaydedildi.')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
    expect(screen.queryByText('190')).not.toBeInTheDocument()
  })

  test('saved paylaşım canonical doğru sayısını ve XP değerini kullanır', () => {
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} saveStatus="saved" savedTotalXP={7} savedCorrectCount={2} savedWrongCount={1} />)
    expect(JSON.parse(screen.getByTestId('share').textContent!)).toEqual(expect.objectContaining({
      score: 2,
      total: 3,
      xp: 7,
    }))
  })

  test.each(['pending', 'failed'] as const)('%s hides unconfirmed coin and share props', (saveStatus) => {
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} saveStatus={saveStatus} coinsEarned={40} />)
    expect(screen.queryByText(/\+40 altın kazandın/)).not.toBeInTheDocument()
    expect(screen.queryByTestId('share')).not.toBeInTheDocument()
    expect(screen.queryByText('XP KAZANCI')).not.toBeInTheDocument()
    expect(screen.getByText(saveStatus === 'pending' ? 'XP TAHMİNİ' : 'XP DOĞRULANMADI')).toBeInTheDocument()
  })

  test('game over cannot hide a failed save alert', () => {
    quiz.value = { ...quiz.value, livesEnabled: true, lives: 0 }
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} saveStatus="failed" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Sonuçlarının kaydı doğrulanamadı')
    expect(screen.queryByText('190')).not.toBeInTheDocument()
  })

  test('gameOver (canlar bitti): Bilge Chan sad pose', () => {
    quiz.value = { ...quiz.value, livesEnabled: true, lives: 0 }
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} />)
    expect(screen.getByAltText('Bilge Chan üzgün')).toBeInTheDocument()
  })

  // ─── Kazanilan altin ─────────────────────────────────

  test('kazanilan altini ve magaza baglantisini gosterir', () => {
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} coinsEarned={40} saveStatus="saved" savedTotalXP={40} />)
    expect(screen.getByText(/\+40 altın kazandın/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Mağaza/ })).toHaveAttribute('href', '/arena/magaza')
  })

  test('altin bilinmiyorken (oturum kaydi surerken/misafir) rozet hic cikmaz', () => {
    // Sonuc ekrani, oturum kaydi tamamlanmadan once render olur; o an null gelir.
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} coinsEarned={null} />)
    expect(screen.queryByText(/altın/)).not.toBeInTheDocument()
  })

  test('gunluk tavan dolu (0 altin): kazanim degil sinir mesaji gosterir', () => {
    render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} coinsEarned={0} saveStatus="saved" savedTotalXP={0} />)
    expect(screen.getByText(/altın sınırına ulaştın/)).toBeInTheDocument()
    expect(screen.queryByText(/\+0 altın/)).not.toBeInTheDocument()
  })
})

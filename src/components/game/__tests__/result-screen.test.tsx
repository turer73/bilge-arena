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

  test('mobilde dikeyde ortalanir (min-h calc + justify-center)', () => {
    const { container } = render(<ResultScreen onRestart={vi.fn()} onExit={vi.fn()} />)
    const root = container.firstChild as HTMLElement
    expect(root.className).toContain('min-h-[calc(100dvh-8rem)]')
    expect(root.className).toContain('justify-center')
  })
})

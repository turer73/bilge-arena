/**
 * Bilge Arena: QuizEngine yerleşim — açıklama paneli cevap sonrası
 * SORUNUN ÜSTÜNDE render olur ("Sonraki Soru" kaydırmasız erişilir).
 * Ağır çocuklar/hook'lar stub'lanır; yalnızca DOM sırası test edilir.
 */

import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// --- Stores ---
const quizStoreValue: Record<string, unknown> = {
  state: 'answered',
  currentIndex: 0,
  questions: [{ id: 'q1' }],
  answers: [{ selectedOption: 2, isCorrect: true }],
  maxLives: 3,
  lives: 3,
  streak: 1,
  maxStreak: 1,
  xpEarned: 10,
  lastXPResult: null,
  isLastQuestion: () => false,
  currentQuestion: () => ({
    id: 'q1',
    game: 'matematik',
    category: 'problemler',
    difficulty: 3,
    content: { question: 'Soru?', options: ['a', 'b', 'c', 'd'], answer: 2 },
  }),
}
vi.mock('@/stores/quiz-store', () => ({ useQuizStore: () => quizStoreValue }))
vi.mock('@/stores/game-store', () => ({
  useGameStore: () => ({
    selectedMode: 'klasik',
    setMode: vi.fn(),
    selectedCategory: null,
    setCategory: vi.fn(),
    selectedDifficulty: null,
    setDifficulty: vi.fn(),
    selectedExamRef: null,
    setExamRef: vi.fn(),
  }),
}))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => ({ user: null, profile: null }) }))

// --- Hooks ---
// Mutable (vi.hoisted) → testler isDeneme'yi çevirebilir (deneme panel kontrolü).
const quizGame = vi.hoisted(() => ({
  screen: 'game',
  isDeneme: false,
  mode: { id: 'klasik', name: 'Klasik', questionCount: 10, timePerQuestion: 30, lives: 3 },
  timer: { seconds: 24 },
  denemeConfig: null,
  loadError: null,
  showBurst: false,
  showXPPopup: false,
  showLifeLost: false,
  showComments: false,
  setShowComments: vi.fn(),
  showReportModal: false,
  setShowReportModal: vi.fn(),
  getOptionState: () => 'idle',
  handleAnswer: vi.fn(),
  handleNext: vi.fn(),
  handleStart: vi.fn(),
}))
vi.mock('@/lib/hooks/use-quiz-game', () => ({ useQuizGame: () => quizGame }))
vi.mock('@/lib/hooks/use-sidebar-data', () => ({
  useSidebarData: () => ({ leaderboard: [], myRank: null, topicData: [] }),
}))
vi.mock('@/lib/hooks/use-session-saver', () => ({ useSessionSaver: vi.fn() }))
vi.mock('@/lib/hooks/use-quiz-limit', () => ({
  useQuizLimit: () => ({ canPlay: true, remaining: 99, isPremium: false, isGuest: true }),
}))
vi.mock('@/lib/hooks/use-daily-quests', () => ({
  useDailyQuests: () => ({ quests: [], claimXP: vi.fn(), updateProgress: vi.fn() }),
}))
vi.mock('@/lib/utils/plausible', () => ({ trackEvent: vi.fn() }))

// --- Ağır çocuk bileşenler: marker/null stub ---
vi.mock('../question-card', () => ({
  QuestionCard: ({ children, onReport }: { children?: React.ReactNode; onReport?: () => void }) => (
    <div data-testid="question-card">
      <button data-testid="qc-report" onClick={onReport} />
      {children}
    </div>
  ),
}))
vi.mock('../explanation-panel', () => ({
  ExplanationPanel: () => <div data-testid="explanation-panel" />,
}))
vi.mock('../option-button', () => ({
  OptionButton: ({ index }: { index: number }) => (
    <button data-testid={`option-${index}`} />
  ),
}))
vi.mock('../lobby', () => ({ Lobby: () => null }))
vi.mock('../timer', () => ({ Timer: () => null }))
vi.mock('../deneme-timer', () => ({ DenemeTimer: () => null }))
vi.mock('../streak-badge', () => ({ StreakBadge: () => null }))
vi.mock('../sound-toggle', () => ({ SoundToggle: () => null }))
vi.mock('../xp-popup', () => ({ XPPopup: () => null }))
vi.mock('../mini-leaderboard', () => ({ MiniLeaderboard: () => null }))
vi.mock('../daily-quests', () => ({ DailyQuests: () => null }))
vi.mock('../topics-panel', () => ({ TopicsPanel: () => <div data-testid="topics-band" /> }))
vi.mock('../life-lost-overlay', () => ({ LifeLostOverlay: () => null }))
vi.mock('@/components/ui/bilge-chan', () => ({ BilgeChan: () => null }))
vi.mock('../bilge-chan-companion', () => ({ BilgeChanCompanion: () => null }))
vi.mock('@/components/premium/premium-gate-modal', () => ({ PremiumGateModal: () => null }))
vi.mock('@/components/ads/ad-banner', () => ({ AdBanner: () => null }))
vi.mock('@/components/ui/error-boundary', () => ({
  ComponentErrorBoundary: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))
// Dynamic bileşenler null; AMA onClose alan (ErrorReportModal) bir kapat-butonu
// render etsin → modal kapatma akışı test edilebilir.
vi.mock('next/dynamic', () => ({
  default: () => (props: { onClose?: () => void }) =>
    props?.onClose ? <button data-testid="report-close" onClick={props.onClose} /> : null,
}))

import { QuizEngine } from '../quiz-engine'

describe('QuizEngine yerleşim', () => {
  test('answered: açıklama paneli soru kartının ÜSTÜNDE', () => {
    render(<QuizEngine game="matematik" />)
    const panel = screen.getByTestId('explanation-panel')
    const card = screen.getByTestId('question-card')
    // panel, karttan ÖNCE gelmeli (DOCUMENT_POSITION_FOLLOWING: card panel'i takip eder)
    expect(panel.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('answered: şıklar panelden SONRA (panel + soru + şıklar sırası)', () => {
    render(<QuizEngine game="matematik" />)
    const panel = screen.getByTestId('explanation-panel')
    const firstOption = screen.getByTestId('option-0')
    expect(panel.compareDocumentPosition(firstOption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('playing: panel render edilmez', () => {
    quizStoreValue.state = 'playing'
    render(<QuizEngine game="matematik" />)
    expect(screen.queryByTestId('explanation-panel')).not.toBeInTheDocument()
    quizStoreValue.state = 'answered'
  })

  test('deneme answered: açıklama paneli render edilir (otomatik geçiş yok, butonla)', () => {
    // Ensar 06-16: deneme'de cevap sonrası otomatik geçmek yerine kullanıcı
    // açıklamayı/yanlışını okuyup "Sonraki Soru" butonuyla geçer. Panel deneme'de
    // de görünmeli (eski kod `!isDeneme` ile gizliyordu → bu test onu engeller).
    quizGame.isDeneme = true
    try {
      render(<QuizEngine game="matematik" />)
      expect(screen.getByTestId('explanation-panel')).toBeInTheDocument()
    } finally {
      quizGame.isDeneme = false
    }
  })

  test('rapor: QuestionCard "Bildir" modalı açar, kapat modalı kapatır (oyun sırasında)', () => {
    quizGame.setShowReportModal = vi.fn()
    render(<QuizEngine game="matematik" />)
    fireEvent.click(screen.getByTestId('qc-report'))
    expect(quizGame.setShowReportModal).toHaveBeenCalledWith(true)
    fireEvent.click(screen.getByTestId('report-close'))
    expect(quizGame.setShowReportModal).toHaveBeenCalledWith(false)
  })

  test('Konu Gücü bandı şıklardan sonra (tam genişlik alt bant korunur)', () => {
    render(<QuizEngine game="matematik" />)
    const band = screen.getByTestId('topics-band')
    const lastOption = screen.getByTestId('option-3')
    expect(lastOption.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

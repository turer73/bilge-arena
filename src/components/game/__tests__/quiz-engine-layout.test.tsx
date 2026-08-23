/**
 * Bilge Arena: QuizEngine yerleşim — açıklama paneli cevap sonrası
 * SORUNUN ÜSTÜNDE render olur ("Sonraki Soru" kaydırmasız erişilir).
 * Ağır çocuklar/hook'lar stub'lanır; yalnızca DOM sırası test edilir.
 */

import { StrictMode } from 'react'
import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// --- Stores ---
const quizStoreValue: Record<string, unknown> = {
  state: 'answered',
  currentIndex: 0,
  questions: [{ id: 'q1' }],
  answers: [{ questionId: 'q1', selectedOption: 2, isCorrect: true }],
  maxLives: 3,
  lives: 3,
  livesEnabled: true,
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
vi.mock('@/stores/quiz-store', () => ({
  useQuizStore: Object.assign(() => quizStoreValue, { getState: () => quizStoreValue }),
}))
const gameStoreValue = vi.hoisted(() => ({
  selectedMode: 'klasik',
  setMode: vi.fn(),
  selectedCategory: 'problemler' as string | null,
  setCategory: vi.fn(),
  selectedDifficulty: 3 as number | null,
  setDifficulty: vi.fn(),
  selectedExamRef: 'TYT' as string | null,
  setExamRef: vi.fn(),
}))
vi.mock('@/stores/game-store', () => ({ useGameStore: () => gameStoreValue }))
const authStoreValue = vi.hoisted(() => ({ user: null as { id: string } | null, profile: null }))
vi.mock('@/stores/auth-store', () => ({ useAuthStore: () => authStoreValue }))

// --- Hooks ---
// Mutable (vi.hoisted) → testler isDeneme'yi çevirebilir (deneme panel kontrolü).
const quizGame = vi.hoisted(() => ({
  screen: 'game',
  attemptId: null as string | null,
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
  setHelpPaused: vi.fn(),
  getOptionState: () => 'idle',
  handleAnswer: vi.fn(),
  handleNext: vi.fn(),
  handleStart: vi.fn(),
  handleStartPlanned: vi.fn(),
  handleStartPreparedDeneme: vi.fn(),
  handleRestart: vi.fn(),
}))
vi.mock('@/lib/hooks/use-quiz-game', () => ({ useQuizGame: () => quizGame }))
vi.mock('@/lib/hooks/use-sidebar-data', () => ({
  useSidebarData: () => ({ leaderboard: [], myRank: null, topicData: [] }),
}))
const useSessionSaverMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/hooks/use-session-saver', () => ({ useSessionSaver: useSessionSaverMock }))
const quizLimitValue = vi.hoisted(() => ({ canPlay: true, remaining: 99, isPremium: false, isGuest: true }))
vi.mock('@/lib/hooks/use-quiz-limit', () => ({ useQuizLimit: () => quizLimitValue }))
vi.mock('@/lib/hooks/use-daily-quests', () => ({
  useDailyQuests: () => ({ quests: [], claimXP: vi.fn(), updateProgress: vi.fn() }),
}))
const todayPlanValue = vi.hoisted(() => ({
  plan: null as null | {
    planDate: string
    game: string
    examRef: string | null
    questions: Array<{ id: string }>
    completedIds: string[]
    attemptId: string
    expiresAt: string
  },
  loading: false,
  markCompleted: vi.fn(),
}))
vi.mock('@/lib/hooks/use-today-plan', () => ({ useTodayPlan: () => todayPlanValue }))
const personalizedMockValue = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  generate: vi.fn(),
}))
vi.mock('@/lib/hooks/use-personalized-mock', () => ({
  usePersonalizedMock: () => personalizedMockValue,
}))
vi.mock('@/lib/hooks/use-mastery-map', () => ({
  useMasteryMap: () => ({ outcomes: [], loading: false, fetchMastery: vi.fn() }),
}))
vi.mock('@/lib/utils/plausible', () => ({ trackEvent: vi.fn() }))
const trackLearningEvent = vi.hoisted(() => vi.fn())
vi.mock('@/lib/analytics/learning-events', () => ({ trackLearningEvent }))
const strategyClient = vi.hoisted(() => ({
  enabled: false,
  start: vi.fn(),
  finalize: vi.fn(),
  fetchAnalysis: vi.fn(),
  exposure: vi.fn(),
}))
vi.mock('@/lib/mock-strategy/client', () => ({
  isMockStrategyUiEnabled: () => strategyClient.enabled,
  startMockStrategyAttempt: strategyClient.start,
  finalizeMockStrategyAttempt: strategyClient.finalize,
  fetchMockStrategyAnalysis: strategyClient.fetchAnalysis,
  recordMockStrategyExposure: strategyClient.exposure,
}))

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
vi.mock('../lobby', () => ({
  Lobby: ({ onStart }: { onStart: () => void }) => <button data-testid="normal-quiz-start" onClick={onStart} />,
}))
vi.mock('../timer', () => ({ Timer: () => null }))
vi.mock('../deneme-timer', () => ({ DenemeTimer: () => null }))
vi.mock('../streak-badge', () => ({ StreakBadge: () => null }))
vi.mock('../sound-toggle', () => ({ SoundToggle: () => null }))
vi.mock('../xp-popup', () => ({ XPPopup: () => null }))
vi.mock('../mini-leaderboard', () => ({ MiniLeaderboard: () => null }))
vi.mock('../daily-quests', () => ({ DailyQuests: () => null }))
vi.mock('../today-plan-card', () => ({
  TodayPlanCard: ({ onStart }: { onStart: () => void }) => <button data-testid="today-plan-start" onClick={onStart} />,
}))
vi.mock('../personalized-mock-card', () => ({
  PersonalizedMockCard: ({ onStart }: { onStart: () => void }) => <button data-testid="personalized-mock-start" onClick={onStart} />,
}))
vi.mock('../mastery-map-card', () => ({ MasteryMapCard: () => null }))
vi.mock('../topics-panel', () => ({ TopicsPanel: () => <div data-testid="topics-band" /> }))
vi.mock('../life-lost-overlay', () => ({ LifeLostOverlay: () => null }))
vi.mock('@/components/ui/bilge-chan', () => ({ BilgeChan: () => null }))
vi.mock('../bilge-chan-companion', () => ({ BilgeChanCompanion: () => <div data-testid="chan-companion" /> }))
vi.mock('@/components/premium/premium-gate-modal', () => ({
  PremiumGateModal: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="premium-modal" /> : null,
}))
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
  test('mobil odak kabuğu ilerleme, süre, can, seri ve çıkış eylemini tek başlıkta toplar', () => {
    render(<QuizEngine game="matematik" />)

    expect(document.body).toHaveClass('mobile-quiz-active')
    expect(screen.getByRole('button', { name: 'Oyundan çık' })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Oyun ilerlemesi' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByLabelText('Kalan süre: 24 saniye')).toBeInTheDocument()
    expect(screen.getByLabelText('3 can')).toBeInTheDocument()
    expect(screen.getByLabelText('1 seri')).toBeInTheDocument()
    expect(screen.getByLabelText('10 oturum XP')).toBeInTheDocument()
  })

  test('uygulama kabugu CSS mobil ve tablette uygulanir (bilgisayarda navbar kalir)', () => {
    const { container } = render(<QuizEngine game="matematik" />)

    const shellStyle = Array.from(container.querySelectorAll('style'))
      .map((node) => node.textContent ?? '')
      .find((text) => text.includes('mobile-quiz-active'))

    expect(shellStyle).toBeDefined()
    expect(shellStyle).toContain('@media (max-width: 1023px)')
    // Medya sorgusu, navbar'i gizleyen kuraldan ONCE gelmeli
    expect(shellStyle!.indexOf('@media (max-width: 1023px)'))
      .toBeLessThan(shellStyle!.indexOf('[data-app-navbar]'))
  })

  test('gorunmeyen masaustu sidebar kaldirildi: koc bileseni tek kopya', () => {
    render(<QuizEngine game="matematik" />)
    // Ikinci (gizli) BilgeChanCompanion her soruda remount olup
    // /api/assistance-policy istegini bosa tekrarliyordu.
    expect(screen.getAllByTestId('chan-companion')).toHaveLength(1)
  })

  test('aktif oyun tablette genisler, bilgisayarda soru ve yardim paneline ayrilir', () => {
    const { container } = render(<QuizEngine game="matematik" />)
    const shell = container.querySelector('[data-responsive-quiz-shell]')
    const companionAside = screen.getByTestId('chan-companion').closest('aside')
    const topicsAside = screen.getByTestId('topics-band').closest('aside')

    expect(shell).toHaveClass('md:max-w-[720px]', 'lg:max-w-[1120px]')
    expect(companionAside).toHaveClass('lg:col-start-2', 'lg:row-start-1')
    expect(topicsAside).toHaveClass('lg:col-start-2', 'lg:row-start-2')
  })

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

  test('Konu Gücü DOM sırasında şıklardan sonra kalır', () => {
    render(<QuizEngine game="matematik" />)
    const band = screen.getByTestId('topics-band')
    const lastOption = screen.getByTestId('option-3')
    expect(lastOption.compareDocumentPosition(band) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe("QuizEngine — Bugünün Planı başlangıcı", () => {
  test('limit doluysa plan başlamaz ve premium modal açılır', () => {
    quizGame.screen = 'lobby'
    authStoreValue.user = { id: 'u1' }
    todayPlanValue.plan = {
      planDate: '2026-07-21',
      game: 'matematik',
      examRef: 'TYT',
      questions: [{ id: 'q-plan' }],
      completedIds: [],
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }
    quizLimitValue.canPlay = false
    quizGame.handleStartPlanned.mockClear()

    try {
      render(<QuizEngine game="matematik" />)
      fireEvent.click(screen.getByTestId('today-plan-start'))
      expect(quizGame.handleStartPlanned).not.toHaveBeenCalled()
      expect(screen.getByTestId('premium-modal')).toBeInTheDocument()
    } finally {
      quizLimitValue.canPlay = true
      authStoreValue.user = null
      todayPlanValue.plan = null
      quizGame.screen = 'game'
    }
  })

  test('plan başlarken eski kategori/zorluk temizlenir ve practice mode kullanılır', () => {
    quizGame.screen = 'lobby'
    authStoreValue.user = { id: 'u1' }
    const questions = [{ id: 'q-plan' }]
    todayPlanValue.plan = {
      planDate: '2026-07-21',
      game: 'matematik',
      examRef: 'TYT',
      questions,
      completedIds: [],
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }
    gameStoreValue.setMode.mockClear()
    gameStoreValue.setCategory.mockClear()
    gameStoreValue.setDifficulty.mockClear()
    quizGame.handleStartPlanned.mockClear()
    trackLearningEvent.mockClear()

    try {
      render(<QuizEngine game="matematik" />)
      fireEvent.click(screen.getByTestId('today-plan-start'))
      expect(gameStoreValue.setMode).toHaveBeenCalledWith('practice')
      expect(gameStoreValue.setCategory).toHaveBeenCalledWith(null)
      expect(gameStoreValue.setDifficulty).toHaveBeenCalledWith(null)
      expect(quizGame.handleStartPlanned).toHaveBeenCalledWith(
        questions,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      )
      expect(trackLearningEvent).toHaveBeenCalledWith('LearningPlanStarted', {
        game: 'matematik',
        planSize: 1,
        completedBefore: 0,
        examRef: 'TYT',
      })
    } finally {
      authStoreValue.user = null
      todayPlanValue.plan = null
      quizGame.screen = 'game'
    }
  })

  test('kısmi planda Devam Et yalnız tamamlanmamış soruları başlatır', () => {
    quizGame.screen = 'lobby'
    authStoreValue.user = { id: 'u1' }
    const questions = [{ id: 'q-done' }, { id: 'q-left-1' }, { id: 'q-left-2' }]
    todayPlanValue.plan = {
      planDate: '2026-07-21',
      game: 'matematik',
      examRef: 'TYT',
      questions,
      completedIds: ['q-done'],
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }
    quizGame.handleStartPlanned.mockClear()

    try {
      render(<QuizEngine game="matematik" />)
      fireEvent.click(screen.getByTestId('today-plan-start'))
      expect(quizGame.handleStartPlanned).toHaveBeenCalledWith(
        [{ id: 'q-left-1' }, { id: 'q-left-2' }],
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      )
    } finally {
      authStoreValue.user = null
      todayPlanValue.plan = null
      quizGame.screen = 'game'
    }
  })

  test('Ders Çalış niyetini plan yüklendikten sonra bir kez tüketip doğrudan başlatır', async () => {
    window.history.replaceState({}, '', '/arena/matematik?start=today-plan')
    quizGame.screen = 'lobby'
    authStoreValue.user = { id: 'u1' }
    todayPlanValue.plan = {
      planDate: '2026-07-21',
      game: 'matematik',
      examRef: 'TYT',
      questions: [{ id: 'q-plan' }],
      completedIds: [],
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }
    quizGame.handleStartPlanned.mockClear()
    gameStoreValue.setExamRef.mockClear()
    gameStoreValue.selectedExamRef = 'AYT-SAY'

    try {
      const { rerender } = render(
        <StrictMode>
          <QuizEngine game="matematik" />
        </StrictMode>,
      )
      await waitFor(() => expect(quizGame.handleStartPlanned).toHaveBeenCalledOnce())
      expect(gameStoreValue.setExamRef).toHaveBeenCalledWith('TYT')
      expect(window.location.search).toBe('')
      rerender(
        <StrictMode>
          <QuizEngine game="matematik" />
        </StrictMode>,
      )
      expect(quizGame.handleStartPlanned).toHaveBeenCalledOnce()
    } finally {
      window.history.replaceState({}, '', '/')
      gameStoreValue.selectedExamRef = 'TYT'
      authStoreValue.user = null
      todayPlanValue.plan = null
      quizGame.screen = 'game'
    }
  })

  test('doğrudan başlangıç niyeti loading bitip plan hazır olana kadar bekler', async () => {
    window.history.replaceState({}, '', '/arena/matematik?start=today-plan')
    quizGame.screen = 'lobby'
    authStoreValue.user = { id: 'u1' }
    todayPlanValue.loading = true
    todayPlanValue.plan = null
    quizGame.handleStartPlanned.mockClear()

    try {
      const { rerender } = render(<QuizEngine game="matematik" />)
      expect(quizGame.handleStartPlanned).not.toHaveBeenCalled()
      expect(window.location.search).toBe('?start=today-plan')

      todayPlanValue.loading = false
      todayPlanValue.plan = {
        planDate: '2026-07-21',
        game: 'matematik',
        examRef: 'TYT',
        questions: [{ id: 'q-ready' }],
        completedIds: [],
        attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }
      rerender(<QuizEngine game="matematik" />)

      await waitFor(() => expect(quizGame.handleStartPlanned).toHaveBeenCalledOnce())
      expect(window.location.search).toBe('')
    } finally {
      window.history.replaceState({}, '', '/')
      todayPlanValue.loading = false
      todayPlanValue.plan = null
      authStoreValue.user = null
      quizGame.screen = 'game'
    }
  })

  test('plan yalnizca dogrulanmis oturum kaydi basarili olunca tamamlanir', () => {
    quizGame.screen = 'lobby'
    authStoreValue.user = { id: 'u1' }
    todayPlanValue.plan = {
      planDate: '2026-07-21',
      game: 'matematik',
      examRef: 'TYT',
      questions: [{ id: 'q1' }],
      completedIds: [],
      attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      expiresAt: '2099-01-01T00:00:00.000Z',
    }
    todayPlanValue.markCompleted.mockClear()
    useSessionSaverMock.mockClear()
    trackLearningEvent.mockClear()

    try {
      render(<QuizEngine game="matematik" />)
      fireEvent.click(screen.getByTestId('today-plan-start'))

      expect(todayPlanValue.markCompleted).not.toHaveBeenCalled()

      const latestOptions = useSessionSaverMock.mock.calls.at(-1)?.[0] as {
        onSessionSaved?: (result: {
          correctAnswers: number
          totalQuestions: number
          maxStreak: number
          accuracy: number
          game: string
        }) => void
      }
      latestOptions.onSessionSaved?.({
        correctAnswers: 1,
        totalQuestions: 1,
        maxStreak: 1,
        accuracy: 100,
        game: 'matematik',
      })

      expect(todayPlanValue.markCompleted).toHaveBeenCalledOnce()
      expect(todayPlanValue.markCompleted).toHaveBeenCalledWith(['q1'])
      expect(trackLearningEvent).toHaveBeenCalledWith('LearningPlanCompleted', {
        game: 'matematik',
        answeredCount: 1,
        correctCount: 1,
        accuracyPercent: 100,
      })
    } finally {
      authStoreValue.user = null
      todayPlanValue.plan = null
      quizGame.screen = 'game'
    }
  })
})

describe('QuizEngine — Akıllı Deneme başlangıcı', () => {
  test('kişisel set hazırlanırken normal quiz aynı anda başlatılamaz', () => {
    quizGame.screen = 'lobby'
    personalizedMockValue.loading = true
    quizGame.handleStart.mockClear()
    try {
      render(<QuizEngine game="matematik" />)
      fireEvent.click(screen.getByTestId('normal-quiz-start'))
      expect(quizGame.handleStart).not.toHaveBeenCalled()
    } finally {
      personalizedMockValue.loading = false
      quizGame.screen = 'game'
    }
  })

  test('limit doluysa üretim çağrılmaz ve premium modal açılır', () => {
    quizGame.screen = 'lobby'
    authStoreValue.user = { id: 'u1' }
    quizLimitValue.canPlay = false
    personalizedMockValue.generate.mockClear()

    try {
      render(<QuizEngine game="matematik" />)
      fireEvent.click(screen.getByTestId('personalized-mock-start'))
      expect(personalizedMockValue.generate).not.toHaveBeenCalled()
      expect(screen.getByTestId('premium-modal')).toBeInTheDocument()
    } finally {
      quizLimitValue.canPlay = true
      authStoreValue.user = null
      quizGame.screen = 'game'
    }
  })

  test('kişisel set gerçek deneme modunda başlatılır ve filtreler temizlenir', async () => {
    quizGame.screen = 'lobby'
    authStoreValue.user = { id: 'u1' }
    const questions = [{ id: 'smart-1' }, { id: 'smart-2' }]
    personalizedMockValue.generate.mockResolvedValueOnce({
      generatedFor: '2026-07-29',
      game: 'matematik',
      examRef: 'TYT',
      questions,
      attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      expiresAt: '2099-01-01T00:00:00.000Z',
      breakdown: { wrong: 1, weak: 1, coverage: 0, weakCategories: ['problemler'] },
    })
    gameStoreValue.setMode.mockClear()
    gameStoreValue.setCategory.mockClear()
    gameStoreValue.setDifficulty.mockClear()
    quizGame.handleStartPreparedDeneme.mockClear()

    try {
      render(<QuizEngine game="matematik" />)
      fireEvent.click(screen.getByTestId('personalized-mock-start'))

      await waitFor(() => expect(gameStoreValue.setMode).toHaveBeenCalledWith('deneme'))
      expect(gameStoreValue.setCategory).toHaveBeenCalledWith(null)
      expect(gameStoreValue.setDifficulty).toHaveBeenCalledWith(null)
      expect(quizGame.handleStartPreparedDeneme).toHaveBeenCalledWith(
        questions,
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      )
    } finally {
      authStoreValue.user = null
      quizGame.screen = 'game'
    }
  })

  test('strateji pilotu sunucu start onayı gelmeden oyunu açmaz', async () => {
    quizGame.screen = 'lobby'
    authStoreValue.user = { id: 'u1' }
    strategyClient.enabled = true
    strategyClient.start.mockResolvedValueOnce(null)
    personalizedMockValue.generate.mockResolvedValueOnce({
      generatedFor: '2026-08-08',
      game: 'matematik',
      examRef: 'TYT',
      questions: [{ id: 'smart-1' }],
      attemptId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      expiresAt: '2099-01-01T00:00:00.000Z',
      strategyEligible: true,
      blueprintVersion: 'personalized-mock-v1',
      breakdown: { wrong: 0, weak: 0, coverage: 1, weakCategories: [] },
    })
    quizGame.handleStartPreparedDeneme.mockClear()
    gameStoreValue.setMode.mockClear()

    try {
      render(<QuizEngine game="matematik" />)
      fireEvent.click(screen.getByTestId('personalized-mock-start'))
      await waitFor(() => expect(strategyClient.start).toHaveBeenCalled())
      expect(quizGame.handleStartPreparedDeneme).not.toHaveBeenCalled()
      expect(gameStoreValue.setMode).not.toHaveBeenCalledWith('deneme')
    } finally {
      strategyClient.enabled = false
      authStoreValue.user = null
      quizGame.screen = 'game'
    }
  })
})

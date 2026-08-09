/**
 * Bilge Arena: useQuizGame çekirdek akış testleri.
 * Kapsam: handleStart (misafir önizleme / auth'lu / hata yolları),
 * handleAnswer (doğru/yanlış + sesler + timer), handleNext, getOptionState.
 * Deneme handleAnswer dalı (timer'a dokunmaz + otomatik ilerleme yok) kapsanır;
 * elapsed/genel-süre ayrıntıları kendi bileşen testlerinde (dürüst kapsam notu).
 */

import { describe, test, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { PublicQuestion } from '@/lib/utils/question-public'

const ATTEMPT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

// --- Stateful quiz-store mock'u ---
const quiz = vi.hoisted(() => {
  const s = {
    state: 'idle' as string,
    streak: 0,
    lives: 3,
    livesEnabled: true,
    answers: [] as Array<{ selectedOption: number; isCorrect: boolean; correctOption: number }>,
    questions: [] as unknown[],
    currentIndex: 0,
    currentQuestion: vi.fn((): unknown => null),
    isLastQuestion: vi.fn(() => false),
    startQuiz: vi.fn(),
    answerQuestion: vi.fn(),
    completeQuiz: vi.fn(),
    nextQuestion: vi.fn(),
    resetQuiz: vi.fn(),
  }
  return s
})
vi.mock('@/stores/quiz-store', () => ({
  useQuizStore: Object.assign(() => quiz, { getState: () => quiz }),
}))

const gameStore = vi.hoisted(() => ({
  selectedMode: 'klasik',
  selectedCategory: null,
  selectedDifficulty: null,
  selectedExamRef: null,
}))
vi.mock('@/stores/game-store', () => ({ useGameStore: () => gameStore }))

const timer = vi.hoisted(() => ({
  seconds: 24,
  isRunning: false,
  start: vi.fn(),
  stop: vi.fn(),
  pause: vi.fn(),
  reset: vi.fn(),
}))
vi.mock('@/lib/hooks/use-timer', () => ({ useTimer: () => timer }))
const elapsed = vi.hoisted(() => ({ reset: vi.fn(), seconds: 0 }))
vi.mock('@/components/game/deneme-timer', () => ({
  useElapsedTime: () => elapsed,
}))

const fetchers = vi.hoisted(() => ({
  fetchQuizQuestions: vi.fn(),
  fetchPreviewQuestion: vi.fn(),
  getAdaptiveDifficulty: vi.fn(() => Promise.resolve(null)),
  playSound: vi.fn(),
}))
vi.mock('@/lib/supabase/questions', () => ({
  fetchQuizQuestions: fetchers.fetchQuizQuestions,
  fetchPreviewQuestion: fetchers.fetchPreviewQuestion,
}))
vi.mock('@/lib/supabase/adaptive-difficulty', () => ({
  getAdaptiveDifficulty: fetchers.getAdaptiveDifficulty,
}))
vi.mock('@/lib/utils/sounds', () => ({ playSound: fetchers.playSound }))
const grader = vi.hoisted(() => ({ gradeQuestion: vi.fn() }))
vi.mock('@/lib/questions/grade-question', () => ({ gradeQuestion: grader.gradeQuestion }))
const strategyTelemetry = vi.hoisted(() => ({ questionOpened: vi.fn() }))
vi.mock('@/lib/mock-strategy/client', () => ({
  recordMockStrategyQuestionOpened: strategyTelemetry.questionOpened,
}))

import { useQuizGame } from '../use-quiz-game'

const makeQ = (id: string): PublicQuestion =>
  ({
    id,
    game: 'matematik',
    category: 'cebir',
    difficulty: 3,
    content: { question: 'Soru?', options: ['a', 'b', 'c', 'd'] },
    base_points: 30,
  }) as PublicQuestion

beforeEach(() => {
  vi.clearAllMocks()
  quiz.state = 'idle'
  quiz.streak = 0
  quiz.lives = 3
  quiz.livesEnabled = true
  quiz.answers = []
  quiz.currentIndex = 0
  quiz.currentQuestion.mockReturnValue(null)
  quiz.isLastQuestion.mockReturnValue(false)
  gameStore.selectedMode = 'klasik'
  fetchers.fetchQuizQuestions.mockResolvedValue({
    questions: Array.from({ length: 30 }, (_, i) => makeQ(`q${i}`)),
    attemptId: ATTEMPT_ID,
    expiresAt: '2099-01-01T00:00:00.000Z',
  })
  fetchers.fetchPreviewQuestion.mockResolvedValue(makeQ('preview'))
  grader.gradeQuestion.mockImplementation(async (_questionId: string, selectedOption: number) => ({
    isCorrect: selectedOption === 2,
    correctOption: 2,
    solution: 'Çözüm',
  }))
  strategyTelemetry.questionOpened.mockResolvedValue(true)
})

describe('useQuizGame — handleStart', () => {
  test('misafir (userId yok): preview sorusuyla 1-soruluk oyun + timer başlar', async () => {
    const { result } = renderHook(() => useQuizGame('matematik', null))
    await act(() => result.current.handleStart())

    expect(fetchers.fetchPreviewQuestion).toHaveBeenCalled()
    expect(fetchers.fetchQuizQuestions).not.toHaveBeenCalled()
    expect(quiz.startQuiz).toHaveBeenCalledWith([expect.objectContaining({ id: 'preview' })], expect.any(Number))
    expect(result.current.isGuestMode).toBe(true)
    expect(result.current.attemptId).toBeNull()
    expect(result.current.screen).toBe('game')
    expect(timer.start).toHaveBeenCalled()
  })

  test('misafir + preview null: loadError + lobby\'de kalır', async () => {
    fetchers.fetchPreviewQuestion.mockResolvedValue(null)
    const { result } = renderHook(() => useQuizGame('matematik', null))
    await act(() => result.current.handleStart())

    expect(result.current.screen).toBe('lobby')
    expect(result.current.loadError).toContain('Soru yüklenemedi')
    expect(quiz.startQuiz).not.toHaveBeenCalled()
  })

  test('auth\'lu: sorular yüklenir, questionCount kadar kesilir, oyun başlar', async () => {
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    await act(() => result.current.handleStart())

    expect(fetchers.fetchQuizQuestions).toHaveBeenCalledWith(
      expect.objectContaining({ game: 'matematik', includeReview: true, mode: 'classic' }),
    )
    const started = quiz.startQuiz.mock.calls[0][0]
    expect(started).toHaveLength(result.current.mode.questionCount)
    expect(result.current.screen).toBe('game')
    expect(result.current.isGuestMode).toBe(false)
    expect(result.current.attemptId).toBe(ATTEMPT_ID)
  })

  test('auth\'lu + boş sonuç: filtre hatası mesajı + lobby', async () => {
    fetchers.fetchQuizQuestions.mockResolvedValue({
      questions: [],
      attemptId: null,
      expiresAt: null,
    })
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    await act(() => result.current.handleStart())

    expect(result.current.screen).toBe('lobby')
    expect(result.current.loadError).toContain('soru bulunamadı')
  })

  test('auth\'lu + fetch throw: genel hata mesajı + lobby', async () => {
    fetchers.fetchQuizQuestions.mockRejectedValue(new Error('ağ'))
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    await act(() => result.current.handleStart())

    expect(result.current.screen).toBe('lobby')
    expect(result.current.loadError).toContain('hata oluştu')
  })
})

describe('useQuizGame — hazır Akıllı Deneme', () => {
  test('fetch yapmadan soruları deneme semantiğiyle başlatır ve sayaçları sıfırlar', () => {
    const questions = [makeQ('smart-1'), makeQ('smart-2')]
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))

    act(() => result.current.handleStartPreparedDeneme(questions, ATTEMPT_ID))

    expect(fetchers.fetchQuizQuestions).not.toHaveBeenCalled()
    expect(quiz.startQuiz).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'smart-1' }),
      expect.objectContaining({ id: 'smart-2' }),
    ])
    expect(elapsed.reset).toHaveBeenCalled()
    expect(timer.reset).toHaveBeenCalledWith(0)
    expect(result.current.screen).toBe('game')
    expect(result.current.isGuestMode).toBe(false)
    expect(result.current.attemptId).toBe(ATTEMPT_ID)
  })

  test('boş soru listesinde oyun başlatılmaz', () => {
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    act(() => result.current.handleStartPreparedDeneme([], null))
    expect(quiz.startQuiz).not.toHaveBeenCalled()
    expect(result.current.screen).toBe('lobby')
  })

  test('tracked pilotta açılış ve cevap eventlerini deterministik sırayla gönderir', async () => {
    const question = makeQ('smart-1')
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))

    act(() => result.current.handleStartPreparedDeneme([question], ATTEMPT_ID, true))
    await waitFor(() => expect(strategyTelemetry.questionOpened).toHaveBeenCalledWith(expect.objectContaining({
      attemptId: ATTEMPT_ID,
      sequence: 1,
      position: 0,
      clientEventId: expect.any(String),
    })))

    quiz.state = 'playing'
    quiz.currentQuestion.mockReturnValue(question)
    await act(async () => result.current.handleAnswer(0))

    expect(grader.gradeQuestion).toHaveBeenCalledWith(
      'smart-1',
      expect.any(Number),
      ATTEMPT_ID,
      expect.any(AbortSignal),
      expect.objectContaining({
        clientEventId: expect.any(String),
        sequence: 2,
        position: 0,
      }),
    )
  })
})

describe('useQuizGame — handleAnswer', () => {
  beforeEach(() => {
    quiz.state = 'playing'
    quiz.currentQuestion.mockReturnValue(makeQ('q1'))
  })

  test('doğru cevap: timer durur, answerQuestion(doğru) + correct sesi + burst', async () => {
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    await act(async () => result.current.handleAnswer(2))

    expect(timer.stop).toHaveBeenCalled()
    // 5. arg = kanonik index (disc#1296); shuffle-haritasi yokken ekran-index'ine duser
    expect(quiz.answerQuestion).toHaveBeenCalledWith(2, true, expect.any(Number), expect.anything(), 2, 2, 'Çözüm')
    expect(fetchers.playSound).toHaveBeenCalledWith('correct')
    expect(result.current.showBurst).toBe(true)
    expect(result.current.showXPPopup).toBe(true)
  })

  test('3+ seri doğru: streak sesi', async () => {
    quiz.streak = 2 // bu cevapla 3 olur
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    await act(async () => result.current.handleAnswer(2))
    expect(fetchers.playSound).toHaveBeenCalledWith('streak')
  })

  test('yanlış cevap (can var): life_lost sesi + can animasyonu', async () => {
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    await act(async () => result.current.handleAnswer(0))

    expect(quiz.answerQuestion).toHaveBeenCalledWith(0, false, expect.any(Number), expect.anything(), 0, 2, 'Çözüm')
    expect(fetchers.playSound).toHaveBeenCalledWith('life_lost')
    expect(result.current.showLifeLost).toBe(true)
  })

  test('son canda yanlış: game_over sesi', async () => {
    quiz.lives = 1
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    await act(async () => result.current.handleAnswer(0))
    expect(fetchers.playSound).toHaveBeenCalledWith('game_over')
  })

  test('playing değilken cevap yok sayılır', () => {
    quiz.state = 'answered'
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    act(() => result.current.handleAnswer(1))
    expect(quiz.answerQuestion).not.toHaveBeenCalled()
  })

  test('deneme: cevapta per-soru timer durdurulmaz ve gerçek süre alanı kaydedilir', async () => {
    // Ensar 06-16: deneme'de per-soru süre yok (genel süre ayrı akar) ve cevap
    // sonrası OTOMATİK geçiş yok — kullanıcı butonla geçer. Burada handleAnswer'ın
    // deneme dalı timer.stop çağırmadığını ve nextQuestion'ı tetiklemediğini kilitler.
    gameStore.selectedMode = 'deneme'
    quiz.currentQuestion.mockReturnValue(makeQ('q1')) // doğru = 2
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    await act(async () => result.current.handleAnswer(2))

    expect(quiz.answerQuestion).toHaveBeenCalledWith(2, true, expect.any(Number), expect.anything(), 2, 2, 'Çözüm')
    expect(timer.stop).not.toHaveBeenCalled()
    expect(quiz.nextQuestion).not.toHaveBeenCalled() // otomatik ilerleme yok
  })

  test('deneme süresi grading sürerken dolarsa cevabı kaydedip sonra tamamlar', async () => {
    gameStore.selectedMode = 'deneme'
    let resolveGrade!: (value: { isCorrect: boolean; correctOption: number; solution: string | null }) => void
    grader.gradeQuestion.mockReturnValue(new Promise((resolve) => { resolveGrade = resolve }))
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))

    act(() => result.current.handleAnswer(2))
    act(() => result.current.handleDenemeTimeUp())
    expect(quiz.completeQuiz).not.toHaveBeenCalled()

    await act(async () => {
      resolveGrade({ isCorrect: true, correctOption: 2, solution: 'Çözüm' })
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(quiz.answerQuestion).toHaveBeenCalled()
    expect(quiz.completeQuiz).toHaveBeenCalledOnce()
    expect(result.current.screen).toBe('result')
  })
})

describe('useQuizGame — handleNext / getOptionState', () => {
  test('son soru değil: nextQuestion + timer reset/start', () => {
    quiz.isLastQuestion.mockReturnValue(false)
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    act(() => result.current.handleNext())

    expect(quiz.nextQuestion).toHaveBeenCalled()
    expect(quiz.completeQuiz).not.toHaveBeenCalled()
    expect(timer.reset).toHaveBeenCalled()
    expect(timer.start).toHaveBeenCalled()
  })

  test('son soru: completeQuiz + result ekranı', () => {
    quiz.isLastQuestion.mockReturnValue(true)
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    act(() => result.current.handleNext())

    expect(quiz.completeQuiz).toHaveBeenCalled()
    expect(result.current.screen).toBe('result')
  })

  test('getOptionState: answered\'da correct/wrong/dim ayrımı', () => {
    quiz.state = 'answered'
    quiz.currentQuestion.mockReturnValue(makeQ('q1')) // doğru = 2
    quiz.answers = [{ selectedOption: 0, isCorrect: false, correctOption: 2 }]
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))

    expect(result.current.getOptionState(2)).toBe('correct')
    expect(result.current.getOptionState(0)).toBe('wrong')
    expect(result.current.getOptionState(1)).toBe('dim')
  })

  test('getOptionState: playing\'de hep idle', () => {
    quiz.state = 'playing'
    quiz.currentQuestion.mockReturnValue(makeQ('q1'))
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    expect(result.current.getOptionState(0)).toBe('idle')
  })
})

describe('useQuizGame — yardım açıkken sayaç duraklatma', () => {
  beforeEach(() => {
    quiz.state = 'playing'
    quiz.currentQuestion.mockReturnValue(makeQ('q1'))
  })

  test('klasik + playing: setHelpPaused(true) sayacı durdurur, (false) devam ettirir', () => {
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    act(() => result.current.setHelpPaused(true))
    expect(timer.pause).toHaveBeenCalled()
    act(() => result.current.setHelpPaused(false))
    expect(timer.start).toHaveBeenCalled()
  })

  test('deneme: yardım sayacı duraklatmaz (genel süre bağımsız akar)', () => {
    gameStore.selectedMode = 'deneme'
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))
    act(() => result.current.setHelpPaused(true))
    expect(timer.pause).not.toHaveBeenCalled()
  })
})

describe('useQuizGame verified attempt fail-closed', () => {
  test('authenticated questions without a ticket do not start', async () => {
    fetchers.fetchQuizQuestions.mockResolvedValue({
      questions: [makeQ('q1')],
      attemptId: null,
      expiresAt: null,
    })
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))

    await act(() => result.current.handleStart())

    expect(quiz.startQuiz).not.toHaveBeenCalled()
    expect(result.current.screen).toBe('lobby')
    expect(result.current.attemptId).toBeNull()
  })

  test('prepared questions without a ticket do not start', () => {
    const { result } = renderHook(() => useQuizGame('matematik', 'u1'))

    act(() => result.current.handleStartPreparedDeneme([makeQ('smart-1')], null))

    expect(quiz.startQuiz).not.toHaveBeenCalled()
    expect(result.current.attemptId).toBeNull()
  })
})

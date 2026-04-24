'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuizStore } from '@/stores/quiz-store'
import { useGameStore } from '@/stores/game-store'
import { useTimer } from '@/lib/hooks/use-timer'
import { calculateXP } from '@/lib/utils/xp'
import { getModeById, DENEME_CONFIGS, type DenemeConfig } from '@/lib/constants/modes'
import type { GameSlug } from '@/lib/constants/games'
import { fetchQuizQuestions } from '@/lib/supabase/questions'
import { getAdaptiveDifficulty } from '@/lib/supabase/adaptive-difficulty'
import { useElapsedTime } from '@/components/game/deneme-timer'
import { playSound } from '@/lib/utils/sounds'
import type { Question } from '@/types/database'
import type { OptionState } from '@/components/game/option-button'
import { getCorrectIndex, shuffleOptions } from '@/lib/utils/question'

// ---------- Fallback demo sorulari ----------
// SADECE Supabase baglantisi koparsa kullanilir — gercek soru bankasi DB'de
const DEMO_QUESTIONS: Question[] = [
  {
    id: 'demo-1', game: 'matematik', category: 'sayilar', subcategory: null, difficulty: 1,
    content: { question: '[Demo] 2 + 3 = ?', options: ['4', '5', '6', '7', '8'], answer: 1, solution: 'Demo soru — internet baglantisinizi kontrol edin.' },
    is_active: true, external_id: null, topic: null, level_tag: null, base_points: 10, is_boss: false, times_answered: 0, times_correct: 0, source: 'demo', exam_ref: null, updated_at: '', created_at: '',
  },
]

// ---------- Hook return tipi ----------

export interface UseQuizGameReturn {
  // Screen
  screen: 'lobby' | 'loading' | 'game' | 'result'

  // Mode bilgileri
  mode: ReturnType<typeof getModeById>
  isDeneme: boolean
  denemeConfig: DenemeConfig | null
  elapsed: ReturnType<typeof useElapsedTime>

  // Timer
  timer: ReturnType<typeof useTimer>

  // Visual effects
  showBurst: boolean
  showXPPopup: boolean
  showLifeLost: boolean
  showComments: boolean
  showReportModal: boolean
  setShowComments: (v: boolean) => void
  setShowReportModal: (v: boolean) => void

  // Aksiyonlar
  handleStart: () => Promise<void>
  handleAnswer: (optionIndex: number) => void
  handleNext: () => void
  handleRestart: () => void
  handleDenemeTimeUp: () => void
  getOptionState: (index: number) => OptionState
}

/**
 * Quiz oyun mantigi hook'u.
 * Screen yonetimi, soru yukleme, cevaplama, zamanlayici, visual efektleri
 * tek bir hook'ta toplar.
 */
export function useQuizGame(game: GameSlug, userId?: string | null): UseQuizGameReturn {
  const quizStore = useQuizStore()
  const gameStore = useGameStore()

  const [screen, setScreen] = useState<'lobby' | 'loading' | 'game' | 'result'>('lobby')
  const [showBurst, setShowBurst] = useState(false)
  const [showXPPopup, setShowXPPopup] = useState(false)
  const [showLifeLost, setShowLifeLost] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showReportModal, setShowReportModal] = useState(false)

  const mode = getModeById(gameStore.selectedMode)
  const isDeneme = mode.isDeneme === true
  const denemeConfig = isDeneme ? DENEME_CONFIGS[game] : null
  const elapsed = useElapsedTime()
  const autoAdvanceRef = useRef<NodeJS.Timeout | null>(null)

  // --- Timer ---

  const handleTimeUp = useCallback(() => {
    const question = quizStore.currentQuestion()
    if (question && quizStore.state === 'playing') {
      const xpResult = calculateXP(question.difficulty, 0, quizStore.streak)
      quizStore.answerQuestion(-1, false, mode.timePerQuestion, xpResult)
    }
  }, [quizStore, mode.timePerQuestion])

  const timer = useTimer({
    initialTime: mode.timePerQuestion,
    onTimeUp: handleTimeUp,
    autoStart: false,
  })

  // --- Deneme: sure dolunca tum sinavi bitir ---

  const handleDenemeTimeUp = useCallback(() => {
    quizStore.completeQuiz()
    setScreen('result')
  }, [quizStore])

  // --- Can bitti: oyunu bitir ---

  useEffect(() => {
    if (quizStore.state === 'completed' && screen === 'game') {
      setScreen('result')
    }
  }, [quizStore.state, screen])

  // --- Deneme: cevap sonrasi otomatik ilerleme ---

  useEffect(() => {
    if (!isDeneme || quizStore.state !== 'answered') return

    autoAdvanceRef.current = setTimeout(() => {
      if (quizStore.isLastQuestion()) {
        quizStore.completeQuiz()
        setScreen('result')
      } else {
        quizStore.nextQuestion()
      }
    }, 1200)

    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current)
    }
  }, [isDeneme, quizStore.state, quizStore])

  // --- Sorulari yukle ve quiz'i baslat ---

  const handleStart = useCallback(async () => {
    setScreen('loading')

    try {
      // Adaptive difficulty: kullanici zorluk secmediyse ve giris yaptiysa,
      // basari oranina gore otomatik zorluk belirle
      let difficulty = gameStore.selectedDifficulty
      if (!difficulty && userId && !isDeneme) {
        try {
          const suggested = await getAdaptiveDifficulty(userId, game, gameStore.selectedCategory)
          if (suggested) difficulty = suggested
        } catch {
          // Adaptive difficulty alinamazsa varsayilan devam eder
        }
      }

      let questions = await fetchQuizQuestions({
        game,
        limit: isDeneme ? mode.questionCount * 2 : mode.questionCount * 3,
        category: gameStore.selectedCategory,
        difficulty,
        userId: isDeneme ? null : userId, // Deneme'de spaced repetition kapatilir
      })

      // Fallback: Supabase'de soru yoksa demo sorulari kullan
      if (questions.length === 0) {
        console.info('[QuizGame] Supabase bos, fallback DEMO_QUESTIONS')
        questions = DEMO_QUESTIONS.filter(q => q.game === game)
        if (questions.length === 0) questions = [...DEMO_QUESTIONS]
      }

      // Sik sirasini karistir — cevap dagılımı dengesizligini onle
      questions = questions.map(q => ({ ...q, content: shuffleOptions(q.content) }))

      if (isDeneme && denemeConfig) {
        // Deneme: kategori dagilimina gore sorulari sec
        const distributed: Question[] = []
        for (const [cat, count] of Object.entries(denemeConfig.questionDistribution)) {
          const catQuestions = questions.filter(q => q.category === cat)
          const shuffled = [...catQuestions].sort(() => Math.random() - 0.5)
          distributed.push(...shuffled.slice(0, count))
        }
        if (distributed.length < mode.questionCount) {
          const remaining = questions.filter(q => !distributed.includes(q))
          const shuffled = [...remaining].sort(() => Math.random() - 0.5)
          distributed.push(...shuffled.slice(0, mode.questionCount - distributed.length))
        }
        distributed.sort(() => Math.random() - 0.5)
        quizStore.startQuiz(distributed.slice(0, mode.questionCount))
        elapsed.reset()
      } else {
        quizStore.startQuiz(questions.slice(0, mode.questionCount), mode.lives)
      }

      setScreen('game')

      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
    } catch (err) {
      console.error('[QuizGame] Soru yukleme hatasi:', err)
      const fallback = DEMO_QUESTIONS.filter(q => q.game === game)
      quizStore.startQuiz(fallback.length > 0 ? fallback : DEMO_QUESTIONS, mode.lives)
      setScreen('game')
      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
    }
  }, [game, mode, quizStore, timer, isDeneme, denemeConfig, elapsed, gameStore.selectedCategory, gameStore.selectedDifficulty, userId])

  // --- Cevap ver ---

  const handleAnswer = useCallback((optionIndex: number) => {
    if (quizStore.state !== 'playing') return

    const question = quizStore.currentQuestion()
    if (!question) return

    if (isDeneme) {
      const isCorrect = optionIndex === getCorrectIndex(question.content)
      const newStreak = isCorrect ? quizStore.streak + 1 : 0
      const xpResult = calculateXP(question.difficulty, 0, newStreak)
      quizStore.answerQuestion(optionIndex, isCorrect, 0, xpResult)

      if (isCorrect) {
        playSound(newStreak >= 3 ? 'streak' : 'correct')
        setShowBurst(true)
        setTimeout(() => setShowBurst(false), 1200)
      } else {
        playSound(quizStore.lives === 1 && quizStore.livesEnabled ? 'game_over' : 'wrong')
        if (quizStore.livesEnabled) {
          setShowLifeLost(true)
          setTimeout(() => setShowLifeLost(false), 700)
        }
      }
    } else {
      timer.stop()
      const timeTaken = mode.timePerQuestion - timer.seconds
      const isCorrect = optionIndex === getCorrectIndex(question.content)
      const newStreak = isCorrect ? quizStore.streak + 1 : 0
      const xpResult = calculateXP(question.difficulty, timer.seconds, newStreak)
      quizStore.answerQuestion(optionIndex, isCorrect, timeTaken, xpResult)

      if (isCorrect) {
        playSound(newStreak >= 3 ? 'streak' : 'correct')
        setShowBurst(true)
        setShowXPPopup(true)
        setTimeout(() => { setShowBurst(false); setShowXPPopup(false) }, 1600)
      } else {
        // Son canda game_over sesi, değilse life_lost (can varsa) veya normal wrong
        const livesNow = quizStore.livesEnabled ? quizStore.lives - 1 : -1
        playSound(livesNow === 0 ? 'game_over' : quizStore.livesEnabled ? 'life_lost' : 'wrong')

        // Can kaybi animasyonu
        if (quizStore.livesEnabled) {
          setShowLifeLost(true)
          setTimeout(() => setShowLifeLost(false), 700)
        }
      }
    }
  }, [quizStore, timer, mode.timePerQuestion, isDeneme])

  // --- Sonraki soru ---

  const handleNext = useCallback(() => {
    setShowComments(false)
    setShowReportModal(false)
    if (quizStore.isLastQuestion()) {
      quizStore.completeQuiz()
      setScreen('result')
    } else {
      quizStore.nextQuestion()
      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
    }
  }, [quizStore, timer, mode.timePerQuestion, isDeneme])

  // --- Yeniden baslat ---

  const handleRestart = useCallback(() => {
    quizStore.resetQuiz()
    setScreen('lobby')
  }, [quizStore])

  // --- Secenek durumu ---

  const getOptionState = useCallback((index: number): OptionState => {
    const question = quizStore.currentQuestion()
    if (quizStore.state !== 'answered' || !question) return 'idle'

    const lastAnswer = quizStore.answers[quizStore.answers.length - 1]
    if (!lastAnswer) return 'idle'

    if (index === getCorrectIndex(question.content)) return 'correct'
    if (index === lastAnswer.selectedOption) return 'wrong'
    return 'dim'
  }, [quizStore])

  return {
    screen,
    mode,
    isDeneme,
    denemeConfig: denemeConfig ?? null,
    elapsed,
    timer,
    showBurst,
    showXPPopup,
    showLifeLost,
    showComments,
    showReportModal,
    setShowComments,
    setShowReportModal,
    handleStart,
    handleAnswer,
    handleNext,
    handleRestart,
    handleDenemeTimeUp,
    getOptionState,
  }
}

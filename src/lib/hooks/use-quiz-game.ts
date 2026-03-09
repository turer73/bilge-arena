'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQuizStore } from '@/stores/quiz-store'
import { useGameStore } from '@/stores/game-store'
import { useTimer } from '@/lib/hooks/use-timer'
import { calculateXP } from '@/lib/utils/xp'
import { getModeById, DENEME_CONFIGS, type DenemeConfig } from '@/lib/constants/modes'
import type { GameSlug } from '@/lib/constants/games'
import { fetchQuizQuestions } from '@/lib/supabase/questions'
import { useElapsedTime } from '@/components/game/deneme-timer'
import type { Question } from '@/types/database'
import type { OptionState } from '@/components/game/option-button'

// ---------- Fallback demo sorulari ----------

const DEMO_QUESTIONS: Question[] = [
  {
    id: 'd1', game: 'matematik', category: 'problemler', sub_category: 'Isci-Havuz', difficulty: 2,
    content: { question: 'Bir isi Ahmet 6 gunde, Mehmet 12 gunde bitirebiliyor. Birlikte calisirlarsa kac gunde bitirirler?', options: ['3 gun', '4 gun', '5 gun', '6 gun'], answer: 1, solution: '1/6+1/12 = 1/4 → 4 gun' },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
  {
    id: 'd2', game: 'turkce', category: 'anlam', sub_category: 'Anlam', difficulty: 2,
    content: { question: 'Asagidaki cumlelerden hangisinde nesnel yargi bulunmaktadir?', options: ['Bu film cok guzeldir', 'Hava bugun oldukca sicak', "Turkiye'nin yuzolcumu 783.562 km²'dir", 'O roman cok sikiciydi'], answer: 2, solution: "Yuzolcumu olculebilir-dogrulanabilir gercektir → nesnel yargi" },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
  {
    id: 'd3', game: 'fen', category: 'fizik', sub_category: 'Fizik', difficulty: 2,
    content: { question: "Newton'in ikinci yasasina gore 5 kg kutleli cisme 20 N net kuvvet uygulanirsa ivmesi kactir?", options: ['2 m/s²', '4 m/s²', '10 m/s²', '25 m/s²'], answer: 1, solution: 'a = F/m = 20/5 = 4 m/s²' },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
  {
    id: 'd4', game: 'sosyal', category: 'tarih', sub_category: 'Tarih', difficulty: 2,
    content: { question: 'Malazgirt Savasi hangi yilda gerceklesmistir?', options: ['1048', '1071', '1096', '1204'], answer: 1, solution: '1071 — Sultan Alparslan vs Bizans; Anadolu kapisi acildi' },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
  },
  {
    id: 'd5', game: 'fen', category: 'kimya', sub_category: 'Kimya', difficulty: 3,
    content: { question: 'pH = 2 olan cozeltinin [H⁺] derisimi nedir?', options: ['10⁻¹²', '10⁻⁷', '10⁻²', '10²'], answer: 2, solution: '[H⁺] = 10^(-pH) = 10⁻² mol/L' },
    is_active: true, play_count: 0, success_rate: 0, created_at: '',
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
export function useQuizGame(game: GameSlug): UseQuizGameReturn {
  const quizStore = useQuizStore()
  const gameStore = useGameStore()

  const [screen, setScreen] = useState<'lobby' | 'loading' | 'game' | 'result'>('lobby')
  const [showBurst, setShowBurst] = useState(false)
  const [showXPPopup, setShowXPPopup] = useState(false)
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
      let questions = await fetchQuizQuestions({
        game,
        limit: isDeneme ? mode.questionCount * 2 : mode.questionCount * 3,
        category: gameStore.selectedCategory,
        difficulty: gameStore.selectedDifficulty,
      })

      // Fallback: Supabase'de soru yoksa demo sorulari kullan
      if (questions.length === 0) {
        console.info('[QuizGame] Supabase bos, fallback DEMO_QUESTIONS')
        questions = DEMO_QUESTIONS.filter(q => q.game === game)
        if (questions.length === 0) questions = [...DEMO_QUESTIONS]
      }

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
        quizStore.startQuiz(questions.slice(0, mode.questionCount))
      }

      setScreen('game')

      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
    } catch (err) {
      console.error('[QuizGame] Soru yukleme hatasi:', err)
      const fallback = DEMO_QUESTIONS.filter(q => q.game === game)
      quizStore.startQuiz(fallback.length > 0 ? fallback : DEMO_QUESTIONS)
      setScreen('game')
      if (!isDeneme && mode.timePerQuestion > 0) {
        timer.reset(mode.timePerQuestion)
        timer.start()
      }
    }
  }, [game, mode, quizStore, timer, isDeneme, denemeConfig, elapsed, gameStore.selectedCategory, gameStore.selectedDifficulty])

  // --- Cevap ver ---

  const handleAnswer = useCallback((optionIndex: number) => {
    if (quizStore.state !== 'playing') return

    const question = quizStore.currentQuestion()
    if (!question) return

    if (isDeneme) {
      const isCorrect = optionIndex === question.content.answer
      const newStreak = isCorrect ? quizStore.streak + 1 : 0
      const xpResult = calculateXP(question.difficulty, 0, newStreak)
      quizStore.answerQuestion(optionIndex, isCorrect, 0, xpResult)

      if (isCorrect) {
        setShowBurst(true)
        setTimeout(() => setShowBurst(false), 1200)
      }
    } else {
      timer.stop()
      const timeTaken = mode.timePerQuestion - timer.seconds
      const isCorrect = optionIndex === question.content.answer
      const newStreak = isCorrect ? quizStore.streak + 1 : 0
      const xpResult = calculateXP(question.difficulty, timer.seconds, newStreak)
      quizStore.answerQuestion(optionIndex, isCorrect, timeTaken, xpResult)

      if (isCorrect) {
        setShowBurst(true)
        setShowXPPopup(true)
        setTimeout(() => { setShowBurst(false); setShowXPPopup(false) }, 1600)
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

    if (index === question.content.answer) return 'correct'
    if (index === lastAnswer.selectedOption) return 'wrong'
    return 'dim'
  }, [quizStore.state, quizStore.answers, quizStore])

  return {
    screen,
    mode,
    isDeneme,
    denemeConfig: denemeConfig ?? null,
    elapsed,
    timer,
    showBurst,
    showXPPopup,
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

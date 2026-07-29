'use client'

import { create } from 'zustand'
import type { PublicQuestion } from '@/lib/utils/question-public'
import type { XPResult } from '@/lib/utils/xp'

export type QuizState = 'idle' | 'loading' | 'playing' | 'answered' | 'completed'

export interface AnswerRecord {
  questionId: string
  selectedOption: number       // EKRAN index'i (shuffle-sonrasi) — UI geri-bildirimi icin
  selectedCanonical: number    // KANONIK DB index'i — server-grading buna gore (shuffle-index bug fix)
  correctOption: number        // EKRAN index'i — yalnız submit sonrası sunucudan açılır
  solution: string | null      // yalnız submit sonrası sunucudan açılır
  isCorrect: boolean
  timeTaken: number        // saniye
  xpEarned: number
}

interface QuizStore {
  // State
  state: QuizState
  questions: PublicQuestion[]
  currentIndex: number
  answers: AnswerRecord[]
  score: number
  streak: number
  maxStreak: number
  xpEarned: number
  sessionXP: number        // Oturum boyunca kazanilan toplam
  lastXPResult: XPResult | null

  // Can sistemi
  lives: number            // Kalan can sayisi
  maxLives: number         // Baslangic can sayisi
  livesEnabled: boolean    // Can sistemi aktif mi
  livesExhausted: boolean  // Son can bitti (oyun-bitti) — ama once cozum gosterilir

  // Actions
  startQuiz: (questions: PublicQuestion[], lives?: number) => void
  answerQuestion: (selectedOption: number, isCorrect: boolean, timeTaken: number, xpResult: XPResult, selectedCanonical?: number, correctOption?: number, solution?: string | null) => void
  nextQuestion: () => void
  completeQuiz: () => void
  resetQuiz: () => void

  // Computed helpers
  currentQuestion: () => PublicQuestion | null
  progress: () => number
  isLastQuestion: () => boolean
}

export const useQuizStore = create<QuizStore>((set, get) => ({
  state: 'idle',
  questions: [],
  currentIndex: 0,
  answers: [],
  score: 0,
  streak: 0,
  maxStreak: 0,
  xpEarned: 0,
  sessionXP: 0,
  lastXPResult: null,
  lives: 0,
  maxLives: 0,
  livesEnabled: false,
  livesExhausted: false,

  startQuiz: (questions, lives) => set({
    state: 'playing',
    questions,
    currentIndex: 0,
    answers: [],
    score: 0,
    streak: 0,
    maxStreak: 0,
    xpEarned: 0,
    sessionXP: 0,
    lastXPResult: null,
    lives: lives ?? 0,
    maxLives: lives ?? 0,
    livesEnabled: (lives ?? 0) > 0,
    livesExhausted: false,
  }),

  answerQuestion: (selectedOption, isCorrect, timeTaken, xpResult, selectedCanonical, correctOption, solution) => {
    const { questions, currentIndex, answers, score, streak, maxStreak, xpEarned, lives, livesEnabled } = get()
    const question = questions[currentIndex]
    if (!question) return

    const newStreak = isCorrect ? streak + 1 : 0
    const xp = isCorrect ? xpResult.total : 0
    const newLives = (!isCorrect && livesEnabled) ? lives - 1 : lives
    // Son can bitse bile state 'answered' KALIR — kullanici dogru cevabi/cozumu gorsun.
    // Oyun-bitti gecisi nextQuestion'da livesExhausted ile yapilir (Ensar bug 2026-06-19:
    // son canda aciklamayi goremeden game-over'a atliyordu).
    const livesExhausted = newLives === 0 && livesEnabled

    set({
      state: 'answered',
      livesExhausted,
      answers: [...answers, {
        questionId: question.id,
        selectedOption,
        // Caller kanonik index vermezse ekran-index'ine dus (shuffle'siz akislar icin dogru).
        selectedCanonical: selectedCanonical ?? selectedOption,
        correctOption: correctOption ?? selectedOption,
        solution: solution ?? null,
        isCorrect,
        timeTaken,
        xpEarned: xp,
      }],
      score: isCorrect ? score + 1 : score,
      streak: newStreak,
      maxStreak: Math.max(maxStreak, newStreak),
      xpEarned: xpEarned + xp,
      sessionXP: xpEarned + xp,
      lastXPResult: isCorrect ? xpResult : null,
      lives: newLives,
    })
  },

  nextQuestion: () => {
    const { currentIndex, questions, livesExhausted } = get()
    // Canlar bittiyse (cozum gosterildikten sonra "devam") oyunu bitir.
    if (livesExhausted || currentIndex + 1 >= questions.length) {
      set({ state: 'completed' })
    } else {
      set({
        state: 'playing',
        currentIndex: currentIndex + 1,
        lastXPResult: null,
      })
    }
  },

  completeQuiz: () => set({ state: 'completed' }),

  resetQuiz: () => set({
    state: 'idle',
    questions: [],
    currentIndex: 0,
    answers: [],
    score: 0,
    streak: 0,
    maxStreak: 0,
    xpEarned: 0,
    sessionXP: 0,
    lastXPResult: null,
    lives: 0,
    maxLives: 0,
    livesEnabled: false,
    livesExhausted: false,
  }),

  currentQuestion: () => {
    const { questions, currentIndex } = get()
    return questions[currentIndex] || null
  },

  progress: () => {
    const { currentIndex, questions } = get()
    if (questions.length === 0) return 0
    return ((currentIndex + 1) / questions.length) * 100
  },

  isLastQuestion: () => {
    const { currentIndex, questions } = get()
    return currentIndex + 1 >= questions.length
  },
}))

'use client'

import { create } from 'zustand'
import type { Question, Difficulty } from '@/types/database'
import type { XPResult } from '@/lib/utils/xp'

export type QuizState = 'idle' | 'loading' | 'playing' | 'answered' | 'completed'

export interface AnswerRecord {
  questionId: string
  selectedOption: number
  isCorrect: boolean
  timeTaken: number        // saniye
  xpEarned: number
}

interface QuizStore {
  // State
  state: QuizState
  questions: Question[]
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

  // Actions
  startQuiz: (questions: Question[], lives?: number) => void
  answerQuestion: (selectedOption: number, isCorrect: boolean, timeTaken: number, xpResult: XPResult) => void
  nextQuestion: () => void
  completeQuiz: () => void
  resetQuiz: () => void

  // Computed helpers
  currentQuestion: () => Question | null
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
  }),

  answerQuestion: (selectedOption, isCorrect, timeTaken, xpResult) => {
    const { questions, currentIndex, answers, score, streak, maxStreak, xpEarned, lives, livesEnabled } = get()
    const question = questions[currentIndex]
    if (!question) return

    const newStreak = isCorrect ? streak + 1 : 0
    const xp = isCorrect ? xpResult.total : 0
    const newLives = (!isCorrect && livesEnabled) ? lives - 1 : lives

    set({
      state: newLives === 0 && livesEnabled ? 'completed' : 'answered',
      answers: [...answers, {
        questionId: question.id,
        selectedOption,
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
    const { currentIndex, questions } = get()
    if (currentIndex + 1 >= questions.length) {
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

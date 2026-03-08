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

  // Actions
  startQuiz: (questions: Question[]) => void
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

  startQuiz: (questions) => set({
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
  }),

  answerQuestion: (selectedOption, isCorrect, timeTaken, xpResult) => {
    const { questions, currentIndex, answers, score, streak, maxStreak, xpEarned } = get()
    const question = questions[currentIndex]
    if (!question) return

    const newStreak = isCorrect ? streak + 1 : 0
    const xp = isCorrect ? xpResult.total : 0

    set({
      state: 'answered',
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
      sessionXP: xp,
      lastXPResult: isCorrect ? xpResult : null,
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

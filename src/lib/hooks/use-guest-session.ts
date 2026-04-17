'use client'

import { useCallback, useEffect, useState } from 'react'

const GUEST_QUIZ_COUNT_KEY = 'guest_quiz_count'

/**
 * Guest kullanicilar icin quiz tamamlama sayacini yonetir.
 * localStorage'da tutulur, kayit olduktan sonra temizlenir.
 */
export function useGuestSession() {
  const [quizCount, setQuizCount] = useState<number>(0)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(GUEST_QUIZ_COUNT_KEY)
      setQuizCount(stored ? parseInt(stored, 10) || 0 : 0)
    } catch {
      // Safari private mode vb. - sessizce atla
    }
  }, [])

  const incrementQuizCount = useCallback((): number => {
    try {
      const current = parseInt(localStorage.getItem(GUEST_QUIZ_COUNT_KEY) ?? '0', 10) || 0
      const next = current + 1
      localStorage.setItem(GUEST_QUIZ_COUNT_KEY, String(next))
      setQuizCount(next)
      return next
    } catch {
      return quizCount + 1
    }
  }, [quizCount])

  const resetQuizCount = useCallback(() => {
    try {
      localStorage.removeItem(GUEST_QUIZ_COUNT_KEY)
      setQuizCount(0)
    } catch {
      // yoksay
    }
  }, [])

  return { quizCount, incrementQuizCount, resetQuizCount }
}

/**
 * Level hesaplama: 1.quiz -> 1, 2.quiz -> 2, 3+.quiz -> 3
 */
export function computePromptLevel(quizCount: number): 1 | 2 | 3 {
  if (quizCount <= 1) return 1
  if (quizCount === 2) return 2
  return 3
}

/**
 * Module-level helper: hook disinda (ornegin use-auth signup callback'i) sayaci sifirlar.
 */
export function resetGuestQuizCount(): void {
  try {
    localStorage.removeItem(GUEST_QUIZ_COUNT_KEY)
  } catch {
    // yoksay
  }
}

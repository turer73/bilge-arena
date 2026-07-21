'use client'

import { useState, useEffect, useCallback } from 'react'
import type { GameSlug } from '@/lib/constants/games'
import type { Question } from '@/types/database'

// NOT: /api/study/today PublicQuestion[] doner (whitelist -- questions/random
// ile ayni desen, bkz. src/lib/supabase/questions.ts fetchQuizQuestions).
// Quiz motoru (quizStore/QuestionCard/vs) Question tipini bekliyor; kullanilan
// alanlar (content/difficulty/category/...) PublicQuestion'da zaten mevcut --
// ayni "as Question[]" kasti-genisletme deseni burada da izlenir.
export interface TodayPlan {
  planDate: string
  game: string
  questions: Question[]
  completedIds: string[]
}

interface TodayPlanResponse {
  planDate: string
  game: string
  questions: Question[]
  completedIds: string[]
}

/**
 * "Bugunun 15'i" gunluk plan client hook'u -- use-daily-quests.ts paritesi.
 * Lobby'de gosterilecek karma plani ceker, tamamlanan sorulari isaretler.
 */
export function useTodayPlan(game: GameSlug, userId?: string | null) {
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchPlan = useCallback(async () => {
    if (!userId) {
      setPlan(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/study/today?game=${game}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as TodayPlanResponse
      setPlan(data)
    } catch {
      // Sessiz hata -- gunluk plan opsiyonel bir yuzey, quiz akisini bloklamaz.
    } finally {
      setLoading(false)
    }
  }, [game, userId])

  // Tamamlanan soru-id'lerini isaretle (optimistic update + server union).
  const markCompleted = useCallback(async (questionIds: string[]) => {
    if (!userId || questionIds.length === 0) return
    setPlan((prev) =>
      prev
        ? { ...prev, completedIds: Array.from(new Set([...prev.completedIds, ...questionIds])) }
        : prev,
    )
    try {
      const res = await fetch('/api/study/today', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game, questionIds }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { completedIds: string[] }
      setPlan((prev) => (prev ? { ...prev, completedIds: data.completedIds ?? prev.completedIds } : prev))
    } catch {
      // Sessiz hata -- optimistic state kalir, sonraki fetchPlan ile senkronize olur.
    }
  }, [game, userId])

  useEffect(() => {
    fetchPlan()
  }, [fetchPlan])

  const completedCount = plan?.completedIds.length ?? 0
  const total = plan?.questions.length ?? 0

  return { plan, loading, completedCount, total, fetchPlan, markCompleted }
}

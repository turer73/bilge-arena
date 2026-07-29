'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { GameSlug } from '@/lib/constants/games'
import type { PublicQuestion } from '@/lib/utils/question-public'

// /api/study/today cevap anahtarı/çözüm içermeyen PublicQuestion[] döner.
// Notlandırma seçimden sonra /api/questions/grade üzerinden yapılır.
export interface TodayPlan {
  planDate: string
  game: string
  /** Server'in COZDUGU exam_ref (profil default'una duesebilir). PATCH bu degeri
   *  geri gonderir -- plan kimligiyle eslesmek zorunda (Codex P2). null = wordquest. */
  examRef: string | null
  questions: PublicQuestion[]
  completedIds: string[]
}

interface TodayPlanResponse {
  planDate: string
  game: string
  examRef: string | null
  questions: PublicQuestion[]
  completedIds: string[]
}

/**
 * "Bugunun 15'i" gunluk plan client hook'u -- use-daily-quests.ts paritesi.
 * Lobby'de gosterilecek karma plani ceker, tamamlanan sorulari isaretler.
 */
export function useTodayPlan(game: GameSlug, userId?: string | null, examRef?: string | null) {
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const requestRef = useRef<AbortController | null>(null)

  const fetchPlan = useCallback(async () => {
    requestRef.current?.abort()
    if (!userId) {
      setPlan(null)
      setLoading(false)
      return
    }
    const controller = new AbortController()
    requestRef.current = controller
    // game/user/exam degisiminde onceki snapshot yeni baglamda gosterilmesin.
    setPlan(null)
    setLoading(true)
    try {
      const params = new URLSearchParams({ game })
      if (examRef) params.set('exam_ref', examRef)
      const res = await fetch(`/api/study/today?${params}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!res.ok) {
        if (!controller.signal.aborted) setPlan(null)
        return
      }
      const data = (await res.json()) as TodayPlanResponse
      if (!controller.signal.aborted) setPlan(data.game === game ? data : null)
    } catch (error) {
      // Sessiz hata -- gunluk plan opsiyonel bir yuzey, quiz akisini bloklamaz.
      if ((error as { name?: string } | null)?.name !== 'AbortError' && !controller.signal.aborted) {
        setPlan(null)
      }
    } finally {
      if (requestRef.current === controller) setLoading(false)
    }
  }, [game, userId, examRef])

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
        // examRef: server'in COZDUGU deger (plan.examRef) -- client'in gonderdigi
        // ham exam_ref DEGIL. Aksi halde (client null, server TYT'ye cozmusse)
        // PATCH lookup yanlis/hic satir bulur (Codex P2 identity).
        body: JSON.stringify({ game, questionIds, examRef: plan?.examRef ?? null }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { completedIds: string[] }
      setPlan((prev) => (prev ? { ...prev, completedIds: data.completedIds ?? prev.completedIds } : prev))
    } catch {
      // Sessiz hata -- optimistic state kalir, sonraki fetchPlan ile senkronize olur.
    }
  }, [game, userId, plan?.examRef])

  useEffect(() => {
    fetchPlan()
    return () => requestRef.current?.abort()
  }, [fetchPlan])

  const completedCount = plan?.completedIds.length ?? 0
  const total = plan?.questions.length ?? 0

  return { plan, loading, completedCount, total, fetchPlan, markCompleted }
}

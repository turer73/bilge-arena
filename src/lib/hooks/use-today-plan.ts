'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { GAMES, type GameSlug } from '@/lib/constants/games'
import type { PublicQuestion } from '@/lib/utils/question-public'
import { isValidUuid } from '@/lib/utils/uuid'
import type { TodayPlanItem } from '@/lib/study/today-plan-contract'

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
  items: TodayPlanItem[]
  attemptId: string | null
  expiresAt: string | null
}

interface TodayPlanResponse {
  planDate: string
  game: string
  examRef: string | null
  questions: PublicQuestion[]
  completedIds: string[]
  items: TodayPlanItem[]
  attemptId: string | null
  expiresAt: string | null
}

/**
 * "Bugunun 15'i" gunluk plan client hook'u -- use-daily-quests.ts paritesi.
 * Lobby'de gosterilecek karma plani ceker, tamamlanan sorulari isaretler.
 */
export function useTodayPlan(
  game: GameSlug,
  userId?: string | null,
  examRef?: string | null,
  selectedCategory?: string | null,
) {
  const [plan, setPlan] = useState<TodayPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [settledContextKey, setSettledContextKey] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const contextKey = `${userId ?? ''}\u0000${game}\u0000${examRef ?? ''}\u0000${selectedCategory ?? ''}`

  const fetchPlan = useCallback(async () => {
    requestRef.current?.abort()
    if (!userId) {
      setPlan(null)
      setSettledContextKey(contextKey)
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
      if (selectedCategory && GAMES[game].categories.some((category) => category === selectedCategory)) {
        params.set('choice_category', selectedCategory)
      }
      const res = await fetch(`/api/study/today?${params}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!res.ok) {
        if (!controller.signal.aborted) setPlan(null)
        return
      }
      const data = (await res.json()) as TodayPlanResponse
      const questionIds = new Set(Array.isArray(data.questions) ? data.questions.map((question) => question.id) : [])
      const validItems = Array.isArray(data.items)
        && data.items.length === questionIds.size
        && data.items.every((item) => (
          item
          && typeof item.questionId === 'string'
          && questionIds.has(item.questionId)
          && Number.isInteger(item.position)
          && typeof item.slotType === 'string'
          && typeof item.sourceType === 'string'
          && typeof item.sourceLabel === 'string'
          && typeof item.completed === 'boolean'
        ))
      const validResponse = data.game === game
        && Array.isArray(data.questions)
        && Array.isArray(data.completedIds)
        && validItems
        && (
          (data.questions.length === 0 && data.attemptId === null && data.expiresAt === null)
          || (
            data.questions.length > 0
            && typeof data.attemptId === 'string'
            && isValidUuid(data.attemptId)
            && typeof data.expiresAt === 'string'
            && Number.isFinite(Date.parse(data.expiresAt))
            && Date.parse(data.expiresAt) > Date.now()
          )
        )
      if (!controller.signal.aborted) setPlan(validResponse ? data : null)
    } catch (error) {
      // Sessiz hata -- gunluk plan opsiyonel bir yuzey, quiz akisini bloklamaz.
      if ((error as { name?: string } | null)?.name !== 'AbortError' && !controller.signal.aborted) {
        setPlan(null)
      }
    } finally {
      if (requestRef.current === controller) {
        setSettledContextKey(contextKey)
        setLoading(false)
      }
    }
  }, [contextKey, game, userId, examRef, selectedCategory])

  // Prop baglami degistigi render'da effect henuz calismamis olsa bile onceki
  // kullanici/oyun/sinav/kategori plani yeni baglamda gorunmez.
  const visiblePlan = settledContextKey === contextKey ? plan : null
  const visibleLoading = settledContextKey === contextKey ? loading : true
  const resolvedExamRef = visiblePlan?.examRef ?? null

  // Tamamlanan soru-id'lerini isaretle (optimistic update + server union).
  const markCompleted = useCallback(async (questionIds: string[]) => {
    if (!userId || questionIds.length === 0) return
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            completedIds: Array.from(new Set([...prev.completedIds, ...questionIds])),
            items: prev.items.map((item) => (
              questionIds.includes(item.questionId) ? { ...item, completed: true } : item
            )),
          }
        : prev,
    )
    try {
      const res = await fetch('/api/study/today', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // examRef: server'in COZDUGU deger (plan.examRef) -- client'in gonderdigi
        // ham exam_ref DEGIL. Aksi halde (client null, server TYT'ye cozmusse)
        // PATCH lookup yanlis/hic satir bulur (Codex P2 identity).
        body: JSON.stringify({ game, questionIds, examRef: resolvedExamRef }),
      })
      if (!res.ok) return
      const data = (await res.json()) as { completedIds: string[]; items?: TodayPlanItem[] }
      setPlan((prev) => (prev
        ? {
            ...prev,
            completedIds: data.completedIds ?? prev.completedIds,
            items: Array.isArray(data.items) ? data.items : prev.items,
          }
        : prev))
    } catch {
      // Sessiz hata -- optimistic state kalir, sonraki fetchPlan ile senkronize olur.
    }
  }, [game, userId, resolvedExamRef])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void fetchPlan()
    })
    return () => {
      active = false
      requestRef.current?.abort()
    }
  }, [fetchPlan])

  const completedCount = visiblePlan?.completedIds.length ?? 0
  const total = visiblePlan?.questions.length ?? 0

  return { plan: visiblePlan, loading: visibleLoading, completedCount, total, fetchPlan, markCompleted }
}

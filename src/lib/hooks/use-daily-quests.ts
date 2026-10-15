'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { toast } from '@/stores/toast-store'
import type { UserDailyQuest } from '@/types/database'

export function useDailyQuests(userId?: string) {
  const currentUserId = useRef(userId)
  currentUserId.current = userId
  const requestId = useRef(0)
  const [questState, setQuestState] = useState<{ userId?: string; items: UserDailyQuest[] }>(
    { userId, items: [] },
  )
  const quests = useMemo(() => questState.userId === userId ? questState.items : [], [questState, userId])
  const [loading, setLoading] = useState(true)

  // Bugünkü görevleri yükle
  const fetchQuests = useCallback(async () => {
    const requestedUserId = userId
    const currentRequest = ++requestId.current
    try {
      if (!requestedUserId) {
        setQuestState({ userId: undefined, items: [] })
        return []
      }
      const res = await fetch('/api/quests')
      if (!res.ok) return []
      const data = await res.json()
      if (currentUserId.current !== requestedUserId || requestId.current !== currentRequest) return []
      const nextQuests = (data.quests ?? []) as UserDailyQuest[]
      setQuestState({ userId: requestedUserId, items: nextQuests })
      return nextQuests
    } catch {
      // Sessiz hata — görevler opsiyonel
      return []
    } finally {
      if (currentUserId.current === requestedUserId && requestId.current === currentRequest) {
        setLoading(false)
      }
    }
  }, [userId])

  // İlerleme migration 093'te doğrulanmış session ile atomik yazılır. İstemci
  // yalnız sunucudaki yeni durumu tekrar okur ve yeni tamamlananları bildirir.
  const updateProgress = useCallback(async (sessionData: {
    correctAnswers: number
    totalQuestions: number
    maxStreak: number
    accuracy: number
    game: string
  }) => {
    void sessionData
    const previouslyCompleted = new Set(
      quests.filter((quest) => quest.is_completed).map((quest) => quest.id),
    )
    const refreshed = await fetchQuests()
    const newlyCompleted = refreshed.filter(
      (quest) => quest.is_completed && !previouslyCompleted.has(quest.id),
    )
    for (const quest of newlyCompleted) {
      if (quest.quest?.title) toast.quest(quest.quest.title)
    }
    return newlyCompleted
  }, [fetchQuests, quests])

  // XP ödülü al
  const claimXP = useCallback(async (questId: string) => {
    if (!userId) return null
    const claimUserId = userId
    try {
      const res = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questId }),
      })
      if (!res.ok) return null
      const data = await res.json()
      if (currentUserId.current !== claimUserId) return null

      // State güncelle
      setQuestState((prev) => prev.userId === claimUserId ? {
        userId: claimUserId,
        items: prev.items.map((q) => q.id === questId ? { ...q, xp_claimed: true } : q),
      } : prev)

      if (data.xp_earned) {
        toast.success(`+${data.xp_earned} XP`, 'Gorev odulu alindi!')
      }

      return data.xp_earned as number
    } catch {
      return null
    }
  }, [userId])

  useEffect(() => {
    fetchQuests()
  }, [fetchQuests])

  const completedCount = quests.filter((q) => q.is_completed).length
  const totalCount = quests.length

  return {
    quests,
    loading,
    completedCount,
    totalCount,
    updateProgress,
    claimXP,
    refetch: fetchQuests,
  }
}

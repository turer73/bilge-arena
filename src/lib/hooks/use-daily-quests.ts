'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from '@/stores/toast-store'
import type { UserDailyQuest } from '@/types/database'

export function useDailyQuests() {
  const [quests, setQuests] = useState<UserDailyQuest[]>([])
  const [loading, setLoading] = useState(true)

  // Bugünkü görevleri yükle
  const fetchQuests = useCallback(async () => {
    try {
      const res = await fetch('/api/quests')
      if (!res.ok) return []
      const data = await res.json()
      const nextQuests = (data.quests ?? []) as UserDailyQuest[]
      setQuests(nextQuests)
      return nextQuests
    } catch {
      // Sessiz hata — görevler opsiyonel
      return []
    } finally {
      setLoading(false)
    }
  }, [])

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
    try {
      const res = await fetch('/api/quests/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questId }),
      })
      if (!res.ok) return null
      const data = await res.json()

      // State güncelle
      setQuests((prev) =>
        prev.map((q) => q.id === questId ? { ...q, xp_claimed: true } : q)
      )

      if (data.xp_earned) {
        toast.success(`+${data.xp_earned} XP`, 'Gorev odulu alindi!')
      }

      return data.xp_earned as number
    } catch {
      return null
    }
  }, [])

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

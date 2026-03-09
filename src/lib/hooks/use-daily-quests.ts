'use client'

import { useState, useEffect, useCallback } from 'react'
import type { UserDailyQuest } from '@/types/database'

export function useDailyQuests() {
  const [quests, setQuests] = useState<UserDailyQuest[]>([])
  const [loading, setLoading] = useState(true)

  // Bugünkü görevleri yükle
  const fetchQuests = useCallback(async () => {
    try {
      const res = await fetch('/api/quests')
      if (!res.ok) return
      const data = await res.json()
      setQuests(data.quests ?? [])
    } catch {
      // Sessiz hata — görevler opsiyonel
    } finally {
      setLoading(false)
    }
  }, [])

  // Oturum sonrası görev ilerlemesini güncelle
  const updateProgress = useCallback(async (sessionData: {
    correctAnswers: number
    totalQuestions: number
    maxStreak: number
    accuracy: number
    game: string
  }) => {
    try {
      const res = await fetch('/api/quests', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionData }),
      })
      if (!res.ok) return
      const data = await res.json()

      // Güncellenen görevleri state'e yansıt
      if (data.updated?.length) {
        setQuests((prev) =>
          prev.map((q) => {
            const updated = data.updated.find((u: UserDailyQuest) => u.id === q.id)
            return updated ?? q
          })
        )
      }

      // Yeni tamamlanan görevleri döndür
      const newlyCompleted = (data.updated ?? []).filter(
        (u: UserDailyQuest) => u.is_completed && !u.xp_claimed
      )
      return newlyCompleted as UserDailyQuest[]
    } catch {
      return []
    }
  }, [])

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

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '@/stores/auth-store'
import { FEATURES, FREE_DAILY_LIMIT } from '@/lib/constants/premium'

interface QuizLimitData {
  limit: number
  used: number
  remaining: number
  isPremium: boolean
  isGuest: boolean
}

interface UseQuizLimitReturn {
  /** Kullanici quiz oynayabilir mi? (feature kapali iken her zaman true) */
  canPlay: boolean
  /** Kalan quiz hakki (-1 = sinirsiz) */
  remaining: number
  /** Bugun kullanilan hak */
  used: number
  /** Gunluk limit */
  limit: number
  /** Premium mi? */
  isPremium: boolean
  /** Misafir mi? */
  isGuest: boolean
  /** Yukleniyor mu? */
  loading: boolean
  /** Veriyi yenile */
  refresh: () => Promise<void>
}

/**
 * Gunluk quiz limiti hook'u.
 *
 * FEATURES.QUIZ_LIMIT false iken her zaman canPlay=true doner.
 * Aktif edildiginde API'den gercek limit verisi cekilir.
 */
export function useQuizLimit(): UseQuizLimitReturn {
  const { user, profile } = useAuthStore()
  const [data, setData] = useState<QuizLimitData | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchLimit = useCallback(async () => {
    // Feature kapali ise API'yi cagirma
    if (!FEATURES.QUIZ_LIMIT) return

    setLoading(true)
    try {
      const res = await fetch('/api/quiz-limit')
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // Sessizce fail — kullaniciya engel olma
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchLimit()
  }, [fetchLimit, user?.id])

  // Feature kapali — herkes oynayabilir
  if (!FEATURES.QUIZ_LIMIT) {
    return {
      canPlay: true,
      remaining: -1,
      used: 0,
      limit: -1,
      isPremium: profile?.is_premium ?? false,
      isGuest: !user,
      loading: false,
      refresh: fetchLimit,
    }
  }

  // Feature aktif — API verisini kullan
  const isPremium = data?.isPremium ?? (profile?.is_premium ?? false)
  const isGuest = data?.isGuest ?? !user
  const limit = data?.limit ?? FREE_DAILY_LIMIT
  const used = data?.used ?? 0
  const remaining = isPremium ? -1 : Math.max(0, limit - used)

  return {
    canPlay: isPremium || isGuest || remaining > 0,
    remaining,
    used,
    limit,
    isPremium,
    isGuest,
    loading,
    refresh: fetchLimit,
  }
}

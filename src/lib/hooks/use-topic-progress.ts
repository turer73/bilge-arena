'use client'

import { useEffect, useMemo, useState } from 'react'
import { GAMES, getCategoryLabel, type GameSlug } from '@/lib/constants/games'

/**
 * Mobil ogrenme yolunun veri kaynagi.
 *
 * Yol, oyunun KANONIK kategori listesini (GAMES[game].categories) adim adim
 * gosterir; ilerleme `/api/profile/topic-strengths` proxy'sinden gelir.
 * Ilk surumde adimlar sabit metinlerdi ve canli modda ilerleme her zaman 0/6
 * gorunuyordu -- bu hook o bosllugu kapatir.
 *
 * "Tamamlandi" icin tek basina yuzde yeterli degil: 1 soruda %100 yapan
 * kullanici konuyu bitirmis sayilmamali. Bu yuzden en az MIN_SAMPLE ornek
 * sarti aranir. Orneklem yetersizse konu "devam ediyor" kabul edilir.
 */

export const TOPIC_MASTERY_THRESHOLD = 70
export const TOPIC_MIN_SAMPLE = 5

export interface TopicProgress {
  category: string
  label: string
  percentage: number
  answered: number
  completed: boolean
}

interface TopicStrengthRow {
  label?: string
  percentage?: number
  category?: string
  total?: number
}

export interface TopicProgressState {
  topics: TopicProgress[]
  /** Sirada olan adim: tamamlanmamis ilk konu. Hepsi bittiyse son adim. */
  currentIndex: number
  completedCount: number
  loading: boolean
  /** Ilerleme gercek veriden mi geldi (misafir/hata durumunda false). */
  hasProgress: boolean
}

export function useTopicProgress(game: GameSlug | null, userId?: string | null): TopicProgressState {
  const [rows, setRows] = useState<TopicStrengthRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!game || !userId) {
      setRows(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/profile/topic-strengths?game=${encodeURIComponent(game)}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { topics?: TopicStrengthRow[] } | null) => {
        if (controller.signal.aborted) return
        setRows(Array.isArray(body?.topics) ? body.topics : [])
        setLoading(false)
      })
      .catch(() => {
        // Ilerleme opsiyonel: hata halinde yol "hic baslanmadi" olarak cizilir.
        if (controller.signal.aborted) return
        setRows(null)
        setLoading(false)
      })

    return () => controller.abort()
  }, [game, userId])

  return useMemo(() => {
    const categories = game ? GAMES[game]?.categories ?? [] : []
    const byCategory = new Map<string, TopicStrengthRow>()
    for (const row of rows ?? []) {
      if (typeof row?.category === 'string') byCategory.set(row.category, row)
    }

    const topics: TopicProgress[] = categories.map((category) => {
      const row = byCategory.get(category)
      const percentage = typeof row?.percentage === 'number' ? row.percentage : 0
      const answered = typeof row?.total === 'number' ? row.total : 0
      return {
        category,
        label: getCategoryLabel(category),
        percentage,
        answered,
        completed: answered >= TOPIC_MIN_SAMPLE && percentage >= TOPIC_MASTERY_THRESHOLD,
      }
    })

    const firstUnfinished = topics.findIndex((topic) => !topic.completed)
    return {
      topics,
      currentIndex: firstUnfinished === -1 ? Math.max(0, topics.length - 1) : firstUnfinished,
      completedCount: topics.filter((topic) => topic.completed).length,
      loading,
      hasProgress: byCategory.size > 0,
    }
  }, [game, rows, loading])
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { getCategoriesForExam, getCategoryLabel, type GameSlug } from '@/lib/constants/games'

/**
 * Mobil ogrenme yolunun veri kaynagi.
 *
 * Yol, oyunun sinav-kapsamli KANONIK kategori listesini adim adim gosterir;
 * ilerleme `/api/profile/topic-strengths` proxy'sinden gelir.
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
  /** Sirada olan adim: tamamlanmamis ilk konu. Hepsi bittiyse -1. */
  currentIndex: number
  completedCount: number
  loading: boolean
  /** API bu kapsam icin karar-guvenli ilerleme yayinliyor mu? */
  available: boolean | null
  /** Ilerleme gercek veriden mi geldi (misafir/hata durumunda false). */
  hasProgress: boolean
}

interface TopicRequestState {
  key: string | null
  rows: TopicStrengthRow[] | null
  available: boolean | null
}

export function useTopicProgress(
  game: GameSlug | null,
  userId?: string | null,
  examRef?: string | null,
): TopicProgressState {
  const requestKey = game && userId ? `${game}:${userId}:${examRef ?? 'all'}` : null
  const [request, setRequest] = useState<TopicRequestState>({
    key: null,
    rows: null,
    available: null,
  })

  useEffect(() => {
    if (!game || !userId || !requestKey) return

    const controller = new AbortController()
    const params = new URLSearchParams({ game })
    if (examRef) params.set('exam_ref', examRef)
    fetch(`/api/profile/topic-strengths?${params}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) throw new Error('topic progress unavailable')
        return response.json().catch(() => null)
      })
      .then((body: { topics?: TopicStrengthRow[]; available?: boolean } | null) => {
        if (controller.signal.aborted) return
        const available = body === null ? null : body.available !== false
        setRequest({
          key: requestKey,
          rows: body !== null && available === true && Array.isArray(body.topics)
            ? body.topics
            : [],
          available,
        })
      })
      .catch(() => {
        // Ilerleme opsiyonel: hata halinde yol "hic baslanmadi" olarak cizilir.
        if (controller.signal.aborted) return
        setRequest({ key: requestKey, rows: null, available: null })
      })

    return () => controller.abort()
  }, [examRef, game, requestKey, userId])

  return useMemo(() => {
    const currentRequest = requestKey && request.key === requestKey ? request : null
    const available = requestKey ? currentRequest?.available ?? null : null
    const categories = available === false
      ? []
      : game ? getCategoriesForExam(game, examRef) : []
    const rows = currentRequest?.rows ?? null
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
      currentIndex: firstUnfinished,
      completedCount: topics.filter((topic) => topic.completed).length,
      loading: Boolean(requestKey && request.key !== requestKey),
      available,
      hasProgress: byCategory.size > 0,
    }
  }, [examRef, game, request, requestKey])
}

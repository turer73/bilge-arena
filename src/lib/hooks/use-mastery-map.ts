'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameSlug } from '@/lib/constants/games'
import type { MasteryStatus } from '@/lib/mastery/status'

export interface MasteryOutcome {
  code: string
  title: string
  description: string | null
  game: string
  category: string
  examRef: string | null
  attempts: number
  correctAttempts: number
  weightedEarned: number
  weightedPossible: number
  delayedCorrect: number
  accuracy: number
  status: MasteryStatus
  lastAnsweredAt: string | null
}

interface MasteryResponse {
  game: string
  examRef: string | null
  outcomes: MasteryOutcome[]
  pilot: boolean
}

export function useMasteryMap(
  game: GameSlug,
  userId?: string | null,
  examRef?: string | null,
) {
  const [outcomes, setOutcomes] = useState<MasteryOutcome[]>([])
  const [loading, setLoading] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  const fetchMastery = useCallback(async () => {
    requestRef.current?.abort()
    if (!userId) {
      setOutcomes([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setOutcomes([])
    setLoading(true)
    try {
      const params = new URLSearchParams({ game })
      if (examRef) params.set('exam_ref', examRef)
      const response = await fetch(`/api/profile/mastery?${params}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (!response.ok) return
      const body = (await response.json()) as MasteryResponse
      if (!controller.signal.aborted && body.game === game) setOutcomes(body.outcomes ?? [])
    } catch (error) {
      if ((error as { name?: string } | null)?.name !== 'AbortError') setOutcomes([])
    } finally {
      if (requestRef.current === controller) setLoading(false)
    }
  }, [examRef, game, userId])

  useEffect(() => {
    fetchMastery()
    return () => requestRef.current?.abort()
  }, [fetchMastery])

  return { outcomes, loading, fetchMastery }
}

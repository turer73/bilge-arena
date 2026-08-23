'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameSlug } from '@/lib/constants/games'
import {
  parseMasteryMapResponse,
  type MasteryCoveragePublic,
  type MasteryMapResponsePublic,
  type MasteryOutcomePublic,
} from '@/lib/mastery/public-contract'

export type MasteryOutcome = MasteryOutcomePublic

const EMPTY_COVERAGE: MasteryCoveragePublic = {
  supported: false,
  taxonomyVersion: null,
  totalQuestions: 0,
  mappedQuestions: 0,
  percentage: 0,
}

export function useMasteryMap(
  game: GameSlug,
  userId?: string | null,
  examRef?: string | null,
) {
  const normalizedExamRef = examRef?.trim().toUpperCase() || null
  const [mastery, setMastery] = useState<MasteryMapResponsePublic | null>(null)
  const [loading, setLoading] = useState(false)
  const requestRef = useRef<AbortController | null>(null)

  const fetchMastery = useCallback(async () => {
    requestRef.current?.abort()
    if (!userId) {
      setMastery(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setMastery(null)
    setLoading(true)
    try {
      const params = new URLSearchParams({ game })
      if (normalizedExamRef) params.set('exam_ref', normalizedExamRef)
      const response = await fetch(`/api/profile/mastery?${params}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (requestRef.current !== controller || controller.signal.aborted) return
      if (!response.ok) {
        setMastery(null)
        return
      }
      const parsed = parseMasteryMapResponse(await response.json())
      if (requestRef.current !== controller || controller.signal.aborted) return
      if (!parsed || parsed.game !== game || parsed.examRef !== normalizedExamRef) {
        setMastery(null)
        return
      }
      setMastery(parsed)
    } catch (error) {
      if (
        requestRef.current === controller
        && (error as { name?: string } | null)?.name !== 'AbortError'
      ) setMastery(null)
    } finally {
      if (requestRef.current === controller) setLoading(false)
    }
  }, [game, normalizedExamRef, userId])

  useEffect(() => {
    void fetchMastery()
    return () => requestRef.current?.abort()
  }, [fetchMastery])

  return {
    response: mastery,
    discovery: mastery?.discovery ?? null,
    outcomes: mastery?.outcomes ?? [],
    graph: mastery?.graph ?? null,
    coverage: mastery?.coverage ?? EMPTY_COVERAGE,
    loading,
    fetchMastery,
  }
}

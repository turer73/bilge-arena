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
  diagnosticAvailable: false,
  taxonomyVersion: null,
  totalQuestions: 0,
  mappedQuestions: 0,
  percentage: 0,
}

export function useMasteryMap(
  game: GameSlug,
  userId?: string | null,
  examRef?: string | null,
  policyEpoch?: string | null,
) {
  // Wordquest questions intentionally use a NULL storage exam_ref, while the
  // released mastery registry exposes the same scope under display ref YDT.
  // Keep that distinction local to mastery; never write YDT into quiz filters.
  const normalizedExamRef = game === 'wordquest'
    ? 'YDT'
    : (examRef?.trim().toUpperCase() || null)
  const [mastery, setMastery] = useState<MasteryMapResponsePublic | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [settledContextKey, setSettledContextKey] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)
  const contextKey = `${userId ?? ''}\u0000${game}\u0000${normalizedExamRef ?? ''}\u0000${policyEpoch ?? ''}`

  const fetchMastery = useCallback(async () => {
    requestRef.current?.abort()
    if (!userId) {
      setMastery(null)
      setLoading(false)
      setError(false)
      setSettledContextKey(contextKey)
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setMastery(null)
    setSettledContextKey(null)
    setError(false)
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
        setError(true)
        return
      }
      const parsed = parseMasteryMapResponse(await response.json())
      if (requestRef.current !== controller || controller.signal.aborted) return
      if (!parsed || parsed.game !== game || parsed.examRef !== normalizedExamRef) {
        setMastery(null)
        setError(true)
        return
      }
      setMastery(parsed)
    } catch (error) {
      if (
        requestRef.current === controller
        && (error as { name?: string } | null)?.name !== 'AbortError'
      ) {
        setMastery(null)
        setError(true)
      }
    } finally {
      if (requestRef.current === controller) {
        setSettledContextKey(contextKey)
        setLoading(false)
      }
    }
  }, [contextKey, game, normalizedExamRef, userId])

  useEffect(() => {
    void fetchMastery()
    return () => requestRef.current?.abort()
  }, [fetchMastery])

  const contextSettled = settledContextKey === contextKey
  const visibleMastery = contextSettled ? mastery : null
  return {
    response: visibleMastery,
    discovery: visibleMastery?.discovery ?? null,
    outcomes: visibleMastery?.outcomes ?? [],
    graph: visibleMastery?.graph ?? null,
    coverage: visibleMastery?.coverage ?? EMPTY_COVERAGE,
    loading: contextSettled ? loading : true,
    error: contextSettled ? error : false,
    fetchMastery,
  }
}

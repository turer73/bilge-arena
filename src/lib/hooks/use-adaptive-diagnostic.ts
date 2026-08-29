'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameSlug } from '@/lib/constants/games'
import {
  parseDiagnosticResponse,
  type DiagnosticResponsePublic,
} from '@/lib/diagnostic/public-contract'

interface AnswerDiagnosticInput {
  sessionId: string
  questionId: string
  selectedOption: number
  responseTimeMs: number
  requestId: string
}

export function useAdaptiveDiagnostic(
  game: GameSlug | null,
  userId?: string | null,
  examRef?: string | null,
) {
  const normalizedExamRef = examRef?.trim().toUpperCase() || null
  const [response, setResponse] = useState<DiagnosticResponsePublic | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<'load' | 'action' | null>(null)
  const loadRef = useRef<AbortController | null>(null)
  const actionRef = useRef<AbortController | null>(null)

  const accept = useCallback((value: unknown) => {
    const parsed = parseDiagnosticResponse(value)
    if (!game || !parsed || parsed.game !== game || parsed.examRef !== normalizedExamRef) return null
    return parsed
  }, [game, normalizedExamRef])

  const refresh = useCallback(async () => {
    loadRef.current?.abort()
    if (!userId || !game || !normalizedExamRef) {
      setResponse(null)
      setLoading(false)
      setError(null)
      return false
    }

    const controller = new AbortController()
    loadRef.current = controller
    setResponse(null)
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ game })
      if (normalizedExamRef) params.set('exam_ref', normalizedExamRef)
      const result = await fetch(`/api/study/diagnostic?${params}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      if (loadRef.current !== controller || controller.signal.aborted) return false
      if (!result.ok) throw new Error('diagnostic_load_failed')
      const parsed = accept(await result.json())
      if (!parsed) throw new Error('diagnostic_payload_invalid')
      setResponse(parsed)
      return true
    } catch (caught) {
      if (
        loadRef.current === controller
        && (caught as { name?: string } | null)?.name !== 'AbortError'
      ) {
        setResponse(null)
        setError('load')
      }
      return false
    } finally {
      if (loadRef.current === controller) setLoading(false)
    }
  }, [accept, game, normalizedExamRef, userId])

  const post = useCallback(async (body: unknown) => {
    actionRef.current?.abort()
    if (!userId) return false
    const controller = new AbortController()
    actionRef.current = controller
    setSubmitting(true)
    setError(null)
    try {
      const result = await fetch('/api/study/diagnostic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (actionRef.current !== controller || controller.signal.aborted) return false
      if (!result.ok) throw new Error('diagnostic_action_failed')
      const parsed = accept(await result.json())
      if (!parsed) throw new Error('diagnostic_payload_invalid')
      setResponse(parsed)
      return true
    } catch (caught) {
      if (
        actionRef.current === controller
        && (caught as { name?: string } | null)?.name !== 'AbortError'
      ) setError('action')
      return false
    } finally {
      if (actionRef.current === controller) setSubmitting(false)
    }
  }, [accept, userId])

  const start = useCallback(() => (
    game && normalizedExamRef
      ? post({ action: 'start', game, examRef: normalizedExamRef })
      : Promise.resolve(false)
  ), [game, normalizedExamRef, post])

  const answer = useCallback((input: AnswerDiagnosticInput) => post({
    action: 'answer',
    ...input,
  }), [post])

  useEffect(() => {
    actionRef.current?.abort()
    void refresh()
    return () => {
      loadRef.current?.abort()
      actionRef.current?.abort()
    }
  }, [refresh])

  return {
    response,
    session: response?.session ?? null,
    summary: response?.summary ?? null,
    supported: response?.supported ?? false,
    loading,
    submitting,
    error,
    refresh,
    start,
    answer,
  }
}

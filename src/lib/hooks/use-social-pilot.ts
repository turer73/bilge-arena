'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { parseSocialPilotPublic, type SocialPilotPublic } from '@/lib/diagnostic/social-pilot-public'

export interface SocialPilotAnswerInput {
  sessionId: string
  questionId: string
  selectedOption: number
  responseTimeMs: number
  requestId: string
}

export function useSocialPilot(userId: string | null | undefined) {
  const [storedResponse, setResponse] = useState<{ owner: string; data: SocialPilotPublic } | null>(null)
  const response = storedResponse && storedResponse.owner === userId ? storedResponse.data : null
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(false)
  const owner = useRef(userId)
  owner.current = userId
  const request = useRef<AbortController | null>(null)
  const requestInProgress = useRef(false)

  const run = useCallback(async (body?: unknown) => {
    if (!userId || requestInProgress.current) return false
    requestInProgress.current = true
    const controller = new AbortController()
    request.current = controller
    if (body) setSubmitting(true)
    else setLoading(true)
    setError(false)
    try {
      const result = await fetch('/api/study/diagnostic/social-pilot', {
        cache: 'no-store', signal: controller.signal,
        ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body) } : {}),
      })
      if (controller.signal.aborted || owner.current !== userId) return false
      if (!result.ok) throw new Error('social_pilot_request_failed')
      const parsed = parseSocialPilotPublic(await result.json())
      if (controller.signal.aborted || owner.current !== userId) return false
      if (!parsed) throw new Error('social_pilot_response_invalid')
      setResponse({ owner: userId, data: parsed })
      return true
    } catch (caught) {
      if (!controller.signal.aborted && owner.current === userId
        && (caught as { name?: string })?.name !== 'AbortError') setError(true)
      return false
    } finally {
      if (request.current === controller) {
        requestInProgress.current = false
        setLoading(false)
        setSubmitting(false)
      }
    }
  }, [userId])
  const refresh = useCallback(() => run(), [run])
  const start = useCallback(() => run({ action: 'start' }), [run])
  const answer = useCallback((input: SocialPilotAnswerInput) => run({ action: 'answer', ...input }), [run])
  useEffect(() => {
    request.current?.abort()
    requestInProgress.current = false
    setResponse(null)
    setError(false)
    setLoading(false)
    setSubmitting(false)
    if (userId) void refresh()
    return () => { request.current?.abort() }
  }, [userId, refresh])
  return { response, loading, submitting, error, refresh, start, answer }
}

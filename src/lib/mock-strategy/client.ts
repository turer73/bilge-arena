'use client'

import { z } from 'zod'
import {
  parseMockStrategyPublicResponse,
  type MockStrategyPublicResponse,
} from './public-contract'

const startResponseSchema = z.object({
  startedAt: z.string().datetime({ offset: true }),
  deadlineAt: z.string().datetime({ offset: true }),
  trackingEnabled: z.boolean(),
  replayed: z.boolean(),
}).strict()

export function isMockStrategyUiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MOCK_STRATEGY_ENABLED === 'true'
}

async function postJson(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
    signal,
  })
}

export async function startMockStrategyAttempt(
  attemptId: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<{
  startedAt: string
  deadlineAt: string
  trackingEnabled: boolean
  replayed: boolean
} | null> {
  const response = await postJson('/api/study/mock-strategy/start', { attemptId, requestId }, signal)
  if (!response.ok) return null
  const parsed = startResponseSchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? parsed.data : null
}

export async function recordMockStrategyQuestionOpened(input: {
  attemptId: string
  clientEventId: string
  sequence: number
  position: number
  signal?: AbortSignal
}): Promise<boolean> {
  try {
    const response = await postJson('/api/study/mock-strategy/events', {
      attemptId: input.attemptId,
      clientEventId: input.clientEventId,
      sequence: input.sequence,
      position: input.position,
      eventType: 'question_opened',
    }, input.signal)
    return response.ok
  } catch {
    return false
  }
}

export async function finalizeMockStrategyAttempt(input: {
  attemptId: string
  sessionId: string
  requestId: string
  signal?: AbortSignal
}): Promise<boolean> {
  try {
    const response = await postJson('/api/study/mock-strategy/finalize', {
      attemptId: input.attemptId,
      sessionId: input.sessionId,
      requestId: input.requestId,
    }, input.signal)
    return response.ok
  } catch {
    return false
  }
}

export async function fetchMockStrategyAnalysis(
  attemptId: string,
  signal?: AbortSignal,
): Promise<MockStrategyPublicResponse | null> {
  try {
    const params = new URLSearchParams({ attemptId })
    const response = await fetch(`/api/study/mock-strategy?${params}`, {
      cache: 'no-store',
      signal,
    })
    if (!response.ok) return null
    return parseMockStrategyPublicResponse(await response.json().catch(() => null))
  } catch {
    return null
  }
}

export async function recordMockStrategyExposure(input: {
  attemptId: string
  revision: number
  requestId: string
  signal?: AbortSignal
}): Promise<boolean> {
  try {
    const response = await postJson('/api/study/mock-strategy/exposure', {
      attemptId: input.attemptId,
      revision: input.revision,
      requestId: input.requestId,
    }, input.signal)
    return response.ok
  } catch {
    return false
  }
}

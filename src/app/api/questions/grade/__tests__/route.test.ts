import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetUser,
  mockQuestionQuery,
  mockAttemptQuery,
  mockFrom,
  mockUserLimiter,
  mockIpLimiter,
  mockGetClientIp,
  mockRecordAttempt,
  mockRpc,
  mockReadSnapshots,
  mockReadGuestCookie,
  mockVerifyGuestToken,
} = vi.hoisted(() => {
  const mockAttemptQuery = vi.fn()
  const mockAttemptGt = vi.fn(() => ({ maybeSingle: mockAttemptQuery }))
  const mockAttemptIs = vi.fn(() => ({ gt: mockAttemptGt }))
  const mockAttemptUserEq = vi.fn(() => ({ is: mockAttemptIs }))
  const mockAttemptIdEq = vi.fn(() => ({ eq: mockAttemptUserEq }))
  const mockQuestionQuery = vi.fn()
  const mockFrom = vi.fn((table: string) => table === 'verified_attempts'
    ? { select: vi.fn(() => ({ eq: mockAttemptIdEq })) }
    : {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({ maybeSingle: mockQuestionQuery })),
          })),
        })),
      })
  return {
    mockGetUser: vi.fn(),
    mockQuestionQuery,
    mockAttemptQuery,
    mockFrom,
    mockUserLimiter: { check: vi.fn() },
    mockIpLimiter: { check: vi.fn() },
    mockGetClientIp: vi.fn(),
    mockRecordAttempt: vi.fn(),
    mockRpc: vi.fn(),
    mockReadSnapshots: vi.fn(),
    mockReadGuestCookie: vi.fn(),
    mockVerifyGuestToken: vi.fn(),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: mockFrom,
    rpc: mockRpc,
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => name === 'questions-grade-user' ? mockUserLimiter : mockIpLimiter),
}))

vi.mock('@/lib/utils/client-ip', () => ({ getClientIp: mockGetClientIp }))
vi.mock('@/lib/questions/attempt-store', () => ({
  recordFirstQuestionAttempt: mockRecordAttempt,
  getFirstQuestionAttempt: vi.fn(),
}))
vi.mock('@/lib/questions/guest-grading-session', () => ({
  guestGradingActorKey: (sessionId: string) => `guest:${sessionId}`,
  readGuestGradingCookie: mockReadGuestCookie,
  verifyGuestGradingToken: mockVerifyGuestToken,
}))
vi.mock('@/lib/verified-attempts', () => ({
  readVerifiedAttemptQuestionSnapshots: mockReadSnapshots,
}))

import { POST } from '../route'
import {
  ACTIVATION_REWARD_COOKIE,
  activationActorKey,
  createActivationRewardToken,
  verifyActivationRewardToken,
} from '@/lib/activation/server-reward'

const QUESTION_ID = '10000000-0000-4000-8000-000000000001'
const ATTEMPT_ID = '20000000-0000-4000-8000-000000000002'
const STRATEGY_EVENT_ID = '30000000-0000-4000-8000-000000000003'
const oldStrategyFlag = process.env.MOCK_STRATEGY_ENABLED
const GUEST_SESSION_ID = '50000000-0000-4000-8000-000000000005'

function request(body: unknown, headers?: HeadersInit) {
  const payload = body && typeof body === 'object' && !Array.isArray(body)
    ? { attemptId: null, ...body }
    : body
  return new Request('http://localhost/api/questions/grade', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie: 'ba_guest_grading=guest-token', ...headers },
    body: JSON.stringify(payload),
  })
}

describe('POST /api/questions/grade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.MOCK_STRATEGY_ENABLED
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockGetClientIp.mockReturnValue('203.0.113.8')
    mockIpLimiter.check.mockResolvedValue({ success: true })
    mockUserLimiter.check.mockResolvedValue({ success: true })
    mockRecordAttempt.mockImplementation(async (_actor: string, _questionId: string, selected: number) => selected)
    mockReadSnapshots.mockResolvedValue([{
      position: 1,
      questionId: QUESTION_ID,
      revisionId: '40000000-0000-4000-8000-000000000004',
      contentSha256: 'a'.repeat(64),
      content: { options: ['a', 'b', 'c', 'd'], answer: 2, solution: 'Co\u0308zu\u0308m' },
      correctOption: 2,
      metadata: { game: 'matematik', category: 'cebir', difficulty: 2, basePoints: 20 },
    }])
    mockReadGuestCookie.mockImplementation((header: string | null) =>
      header?.includes('ba_guest_grading=') ? 'guest-token' : null
    )
    mockVerifyGuestToken.mockImplementation((raw: string | null) => raw ? {
      version: 1,
      sessionId: GUEST_SESSION_ID,
      questionIds: [QUESTION_ID],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 7_200_000,
    } : null)
    mockAttemptQuery.mockResolvedValue({
      data: { id: ATTEMPT_ID, question_ids: [QUESTION_ID] },
      error: null,
    })
    mockQuestionQuery.mockResolvedValue({
      data: { id: QUESTION_ID, content: { options: ['a', 'b', 'c', 'd'], answer: 2, solution: 'Co\u0308zu\u0308m' } },
      error: null,
    })
  })

  afterAll(() => {
    if (oldStrategyFlag === undefined) delete process.env.MOCK_STRATEGY_ENABLED
    else process.env.MOCK_STRATEGY_ENABLED = oldStrategyFlag
  })

  it('rejects an invalid request before querying a question', async () => {
    const res = await POST(request({ questionId: 'not-a-uuid', selectedOption: 5 }))

    expect(res.status).toBe(400)
    expect(mockQuestionQuery).not.toHaveBeenCalled()
  })

  it('returns 429 from the anonymous IP limit', async () => {
    mockIpLimiter.check.mockResolvedValue({ success: false, retryAfter: 17 })

    const res = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))

    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('17')
    expect(mockIpLimiter.check).toHaveBeenCalledWith('203.0.113.8')
  })

  it('returns a generic 404 for missing, inactive, or malformed question data', async () => {
    mockQuestionQuery.mockResolvedValueOnce({ data: null, error: null })
    const missing = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: 'Soru bulunamadi' })

    mockQuestionQuery.mockResolvedValueOnce({ data: { id: QUESTION_ID, content: { options: ['a', 'b'], answer: 9 } }, error: null })
    const malformed = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))
    expect(malformed.status).toBe(404)
    expect(await malformed.json()).toEqual({ error: 'Soru bulunamadi' })
  })

  it('rejects conflicting answer fields and out-of-range option indexes', async () => {
    mockQuestionQuery.mockResolvedValueOnce({
      data: { id: QUESTION_ID, content: { options: ['a', 'b', 'c'], answer: 1, correct: 2 } },
      error: null,
    })
    expect((await POST(request({ questionId: QUESTION_ID, selectedOption: 1 }))).status).toBe(404)

    mockQuestionQuery.mockResolvedValueOnce({
      data: { id: QUESTION_ID, content: { options: ['a', 'b'], answer: 2 } },
      error: null,
    })
    expect((await POST(request({ questionId: QUESTION_ID, selectedOption: 1 }))).status).toBe(404)
  })

  it('does not expose database errors', async () => {
    mockQuestionQuery.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'sensitive database detail' } })

    const res = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Notlandirma su anda kullanilamiyor' })
  })

  it('returns the post-submit feedback for correct and wrong selections', async () => {
    const correct = await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))
    expect(correct.status).toBe(200)
    expect(await correct.json()).toEqual({ isCorrect: true, correctOption: 2, solution: 'Co\u0308zu\u0308m' })

    const wrong = await POST(request({ questionId: QUESTION_ID, selectedOption: 1 }))
    expect(wrong.status).toBe(200)
    expect(await wrong.json()).toEqual({ isCorrect: false, correctOption: 2, solution: 'Co\u0308zu\u0308m' })
  })

  it('isolates two guest sessions behind the same IP', async () => {
    const secondSessionId = '60000000-0000-4000-8000-000000000006'

    await POST(request({ questionId: QUESTION_ID, selectedOption: 2 }))
    mockVerifyGuestToken.mockReturnValueOnce({
      version: 1,
      sessionId: secondSessionId,
      questionIds: [QUESTION_ID],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 7_200_000,
    })
    await POST(request({ questionId: QUESTION_ID, selectedOption: 1 }))

    expect(mockGetClientIp).toHaveBeenCalledWith(expect.any(Headers))
    expect(mockRecordAttempt).toHaveBeenNthCalledWith(1, `guest:${GUEST_SESSION_ID}`, QUESTION_ID, 2)
    expect(mockRecordAttempt).toHaveBeenNthCalledWith(2, `guest:${secondSessionId}`, QUESTION_ID, 1)
  })

  it('reveals feedback after a timed-out skip without marking it correct', async () => {
    const res = await POST(request({ questionId: QUESTION_ID, selectedOption: -1 }))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      isCorrect: false,
      correctOption: 2,
      solution: 'Co\u0308zu\u0308m',
    })
  })

  it('uses the authenticated user key instead of the anonymous IP key', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })

    const res = await POST(request({
      questionId: QUESTION_ID,
      selectedOption: 2,
      attemptId: ATTEMPT_ID,
    }))

    expect(res.status).toBe(200)
    expect(mockUserLimiter.check).toHaveBeenCalledWith('user-42')
    expect(mockIpLimiter.check).not.toHaveBeenCalled()
    expect(mockGetClientIp).not.toHaveBeenCalled()
    expect(mockRecordAttempt).toHaveBeenCalledWith(
      `attempt:${ATTEMPT_ID}:user:user-42`,
      QUESTION_ID,
      2,
    )
    expect(mockReadSnapshots).toHaveBeenCalledWith(expect.anything(), {
      attemptId: ATTEMPT_ID,
      userId: 'user-42',
    })
    expect(mockQuestionQuery).not.toHaveBeenCalled()
  })

  it('replayed selection is graded against the first accepted attempt', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })
    mockRecordAttempt.mockResolvedValue(-1)

    const res = await POST(request({
      questionId: QUESTION_ID,
      selectedOption: 2,
      attemptId: ATTEMPT_ID,
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ isCorrect: false, correctOption: 2 })
  })

  it('binds guest grading to the signed activation question set instead of the IP', async () => {
    const token = createActivationRewardToken([QUESTION_ID])
    const session = verifyActivationRewardToken(token)
    expect(token).toBeTruthy()
    expect(session).toBeTruthy()

    const res = await POST(request(
      { questionId: QUESTION_ID, selectedOption: 2 },
      { cookie: `${ACTIVATION_REWARD_COOKIE}=${encodeURIComponent(token!)}` },
    ))

    expect(res.status).toBe(200)
    expect(mockRecordAttempt).toHaveBeenCalledWith(
      activationActorKey(session!.sessionId),
      QUESTION_ID,
      2,
    )
  })

  it('allows a signed-in user to finish a signed activation question without a quiz attempt', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })
    const token = createActivationRewardToken([QUESTION_ID])
    const session = verifyActivationRewardToken(token)

    const res = await POST(request(
      { questionId: QUESTION_ID, selectedOption: 2 },
      { cookie: `${ACTIVATION_REWARD_COOKIE}=${encodeURIComponent(token!)}` },
    ))

    expect(res.status).toBe(200)
    expect(mockUserLimiter.check).toHaveBeenCalledWith('user-42')
    expect(mockReadSnapshots).not.toHaveBeenCalled()
    expect(mockRecordAttempt).toHaveBeenCalledWith(
      activationActorKey(session!.sessionId),
      QUESTION_ID,
      2,
    )
  })

  it('records server-receipt answer telemetry best-effort without breaking grading', async () => {
    process.env.MOCK_STRATEGY_ENABLED = 'true'
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001' } })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const res = await POST(request({
      questionId: QUESTION_ID,
      selectedOption: 2,
      attemptId: ATTEMPT_ID,
      strategyEvent: {
        clientEventId: STRATEGY_EVENT_ID,
        sequence: 2,
        position: 0,
      },
    }))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ isCorrect: true })
    expect(mockRpc).toHaveBeenCalledWith('record_verified_exam_strategy_event', {
      p_attempt_id: ATTEMPT_ID,
      p_user_id: 'user-42',
      p_client_event_id: STRATEGY_EVENT_ID,
      p_sequence: 2,
      p_position: 0,
      p_event_type: 'answer_submitted',
    })
    consoleSpy.mockRestore()
  })

  it('authenticated request without an attempt fails closed before question lookup', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })

    const res = await POST(request(
      { questionId: QUESTION_ID, selectedOption: 2 },
      { cookie: '' },
    ))

    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Deneme dogrulanamadi' })
    expect(mockQuestionQuery).not.toHaveBeenCalled()
  })

  it('rejects an anonymous grade without a signed guest session', async () => {
    const res = await POST(request(
      { questionId: QUESTION_ID, selectedOption: 2 },
      { cookie: '' },
    ))

    expect(res.status).toBe(403)
    expect(mockRecordAttempt).not.toHaveBeenCalled()
    expect(mockQuestionQuery).not.toHaveBeenCalled()
  })

  it('rejects a guest carrying an attempt ticket', async () => {
    const res = await POST(request({
      questionId: QUESTION_ID,
      selectedOption: 2,
      attemptId: ATTEMPT_ID,
    }))

    expect(res.status).toBe(403)
    expect(mockAttemptQuery).not.toHaveBeenCalled()
    expect(mockQuestionQuery).not.toHaveBeenCalled()
  })

  it('rejects missing attempts and questions outside the issued set', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })
    mockReadSnapshots.mockRejectedValueOnce(new Error('verified_attempt_snapshot_denied'))

    const missing = await POST(request({
      questionId: QUESTION_ID,
      selectedOption: 2,
      attemptId: ATTEMPT_ID,
    }))
    expect(missing.status).toBe(403)

    mockReadSnapshots.mockResolvedValueOnce([{
      position: 1,
      questionId: '30000000-0000-4000-8000-000000000003',
      content: { options: ['a', 'b'], answer: 1 },
      correctOption: 1,
      metadata: { game: 'matematik', category: 'cebir', difficulty: 2, basePoints: 20 },
    }])
    const outsideSet = await POST(request({
      questionId: QUESTION_ID,
      selectedOption: 2,
      attemptId: ATTEMPT_ID,
    }))
    expect(outsideSet.status).toBe(403)
    expect(mockQuestionQuery).not.toHaveBeenCalled()
  })

  it('altyapi kusurunda 403 degil yeniden denenebilir 503 doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })
    mockReadSnapshots.mockRejectedValueOnce(
      Object.assign(new Error('verified_attempt_snapshot_unavailable'), { cause: 'PGRST202' }),
    )

    const res = await POST(request({
      questionId: QUESTION_ID,
      selectedOption: 2,
      attemptId: ATTEMPT_ID,
    }))

    expect(res.status).toBe(503)
    expect(res.headers.get('Retry-After')).toBe('15')
    expect(await res.json()).toEqual({
      error: 'Notlandırma geçici olarak kullanılamıyor. Birazdan tekrar dene.',
    })
  })

  it('returns a generic 500 when attempt verification fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-42' } } })
    mockReadSnapshots.mockRejectedValue(new Error('verified_attempt_snapshot_read_failed'))

    const res = await POST(request({
      questionId: QUESTION_ID,
      selectedOption: 2,
      attemptId: ATTEMPT_ID,
    }))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Notlandirma su anda kullanilamiyor' })
    expect(mockQuestionQuery).not.toHaveBeenCalled()
  })

  it('supports WordQuest correct/explanation content and caps feedback length', async () => {
    mockQuestionQuery.mockResolvedValue({
      data: { id: QUESTION_ID, content: { options: ['a', 'b', 'c', 'd', 'e'], correct: 4, explanation: 'x'.repeat(2_100) } },
      error: null,
    })

    const res = await POST(request({ questionId: QUESTION_ID, selectedOption: 4 }))
    const body = await res.json()

    expect(body).toMatchObject({ isCorrect: true, correctOption: 4 })
    expect(body.solution).toHaveLength(2_000)
  })
})

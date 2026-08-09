import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'
import { POST as start } from '../start/route'
import { POST as event } from '../events/route'
import { POST as finalize } from '../finalize/route'
import { POST as exposure } from '../exposure/route'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mocks.rpc })),
}))

const USER_ID = '11111111-2222-4333-8444-555555555555'
const ATTEMPT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const SESSION_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const REQUEST_ID = 'cccccccc-dddd-4eee-8fff-000000000000'
const EVENT_ID = 'dddddddd-eeee-4fff-8000-111111111111'
const oldFlag = process.env.MOCK_STRATEGY_ENABLED

function post(url: string, body: unknown) {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('mock strategy routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.MOCK_STRATEGY_ENABLED = 'true'
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mocks.rpc.mockResolvedValue({ data: {}, error: null })
  })

  afterAll(() => {
    if (oldFlag === undefined) delete process.env.MOCK_STRATEGY_ENABLED
    else process.env.MOCK_STRATEGY_ENABLED = oldFlag
  })

  it('fails closed before auth when the server switch is off', async () => {
    delete process.env.MOCK_STRATEGY_ENABLED
    const response = await start(post('http://local/start', { attemptId: ATTEMPT_ID, requestId: REQUEST_ID }))
    expect(response.status).toBe(503)
    expect(mocks.getUser).not.toHaveBeenCalled()
  })

  it('requires auth and a strict start payload, then forwards only server-owned scope', async () => {
    expect((await start(post('http://local/start', {
      attemptId: ATTEMPT_ID,
      requestId: REQUEST_ID,
      variant: 'treatment',
    }))).status).toBe(400)

    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await start(post('http://local/start', { attemptId: ATTEMPT_ID, requestId: REQUEST_ID }))).status).toBe(401)

    mocks.rpc.mockResolvedValueOnce({
      data: {
        attemptId: ATTEMPT_ID,
        status: 'active',
        startedAt: '2026-08-08T10:00:00.000Z',
        deadlineAt: '2026-08-08T11:00:00.000Z',
        experiment: {
          key: 'mock_strategy_analysis_v1',
          revision: 1,
          variant: 'treatment',
        },
        replayed: false,
      },
      error: null,
    })
    const response = await start(post('http://local/start', { attemptId: ATTEMPT_ID, requestId: REQUEST_ID }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ trackingEnabled: true, replayed: false })
    expect(mocks.rpc).toHaveBeenCalledWith('start_verified_exam_attempt', {
      p_attempt_id: ATTEMPT_ID,
      p_user_id: USER_ID,
      p_request_id: REQUEST_ID,
    })
  })

  it('records only the closed question_opened event contract', async () => {
    const response = await event(post('http://local/events', {
      attemptId: ATTEMPT_ID,
      clientEventId: EVENT_ID,
      sequence: 1,
      position: 0,
      eventType: 'question_opened',
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('record_verified_exam_strategy_event', expect.objectContaining({
      p_user_id: USER_ID,
      p_event_type: 'question_opened',
    }))

    expect((await event(post('http://local/events', {
      attemptId: ATTEMPT_ID,
      clientEventId: EVENT_ID,
      sequence: 2,
      position: 0,
      eventType: 'answer_submitted',
    }))).status).toBe(400)
  })

  it('normalizes a draft/paused experiment start to tracking disabled', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        attemptId: ATTEMPT_ID,
        status: 'active',
        startedAt: '2026-08-08T10:00:00.000Z',
        deadlineAt: '2026-08-08T11:00:00.000Z',
        experiment: null,
        replayed: false,
      },
      error: null,
    })
    const response = await start(post('http://local/start', {
      attemptId: ATTEMPT_ID,
      requestId: REQUEST_ID,
    }))
    expect(await response.json()).toEqual({
      startedAt: '2026-08-08T10:00:00.000Z',
      deadlineAt: '2026-08-08T11:00:00.000Z',
      trackingEnabled: false,
      replayed: false,
    })
  })

  it('finalizes only an authenticated attempt/session pair', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        sessionId: SESSION_ID,
        finalizedAt: '2026-08-08T11:00:00.000Z',
        replayed: false,
      },
      error: null,
    })
    const response = await finalize(post('http://local/finalize', {
      attemptId: ATTEMPT_ID,
      sessionId: SESSION_ID,
      requestId: REQUEST_ID,
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('finalize_verified_exam_attempt', {
      p_attempt_id: ATTEMPT_ID,
      p_user_id: USER_ID,
      p_request_id: REQUEST_ID,
    })
  })

  it('returns strict treatment analysis without IDs, timestamps or client timing', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        experimentKey: 'mock_strategy_analysis_v1',
        revision: 1,
        variant: 'treatment',
        plannedCount: 2,
        startedAt: '2026-08-08T10:00:00.000Z',
        deadlineAt: '2026-08-08T11:00:00.000Z',
        items: [
          {
            position: 0,
            answered: true,
            isCorrect: false,
            isSkipped: false,
            openedAt: '2026-08-08T10:00:05.000Z',
            submittedAt: '2026-08-08T10:00:15.000Z',
          },
          {
            position: 1,
            answered: false,
            isCorrect: null,
            isSkipped: false,
            openedAt: '2026-08-08T10:00:20.000Z',
            submittedAt: null,
          },
        ],
      },
      error: null,
    })
    const response = await GET(new Request(`http://local/api/study/mock-strategy?attemptId=${ATTEMPT_ID}`))
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      experiment: { key: 'mock_strategy_analysis_v1', revision: 1, variant: 'treatment' },
      analysis: { basis: 'server_receipt_approximate', rushedWrong: 1, unanswered: 1 },
    })
    expect(JSON.stringify(body)).not.toContain(ATTEMPT_ID)
    expect(JSON.stringify(body)).not.toContain('openedAt')
    expect(JSON.stringify(body)).not.toContain('submittedAt')
    expect(JSON.stringify(body)).not.toContain('timeTaken')
  })

  it('keeps control response analysis-free', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        experimentKey: 'mock_strategy_analysis_v1',
        revision: 1,
        variant: 'control',
        plannedCount: 40,
        startedAt: '2026-08-08T10:00:00.000Z',
        deadlineAt: '2026-08-08T11:00:00.000Z',
        items: [],
      },
      error: null,
    })
    const response = await GET(new Request(`http://local/api/study/mock-strategy?attemptId=${ATTEMPT_ID}`))
    expect(await response.json()).toEqual({
      experiment: { key: 'mock_strategy_analysis_v1', revision: 1, variant: 'control' },
      analysis: null,
    })
  })

  it('records exposure with the fixed experiment key and rejects client-selected keys', async () => {
    const response = await exposure(post('http://local/exposure', {
      attemptId: ATTEMPT_ID,
      revision: 1,
      requestId: REQUEST_ID,
    }))
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('record_verified_exam_exposure', {
      p_attempt_id: ATTEMPT_ID,
      p_user_id: USER_ID,
      p_experiment_key: 'mock_strategy_analysis_v1',
      p_revision: 1,
      p_request_id: REQUEST_ID,
    })
    expect((await exposure(post('http://local/exposure', {
      attemptId: ATTEMPT_ID,
      revision: 1,
      requestId: REQUEST_ID,
      experimentKey: 'attacker-choice',
    }))).status).toBe(400)
  })

  it('maps scoped RPC rejection without exposing database details', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'owner mismatch secret' } })
    const response = await finalize(post('http://local/finalize', {
      attemptId: ATTEMPT_ID,
      sessionId: SESSION_ID,
      requestId: REQUEST_ID,
    }))
    expect(response.status).toBe(409)
    expect(JSON.stringify(await response.json())).not.toContain('owner mismatch')
  })
})

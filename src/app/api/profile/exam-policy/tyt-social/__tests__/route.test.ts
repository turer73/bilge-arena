import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

const { getUser, rpc, check } = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  check: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, rpc })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check })),
}))

import { GET, PUT } from '../route'

const active = {
  status: 'active',
  policyVersion: 'tyt-social-2026-v1',
  variant: 'questions_16_20',
  effectiveAt: '2026-08-31T08:00:00+00:00',
  appliesTo: 'new_artifacts_only',
}

function request(method = 'GET', body?: unknown, idempotencyKey?: string | null) {
  const headers = new Headers({
    'cf-connecting-ip': '203.0.113.1',
    'content-type': 'application/json',
  })
  const bodyRequestId = body && typeof body === 'object' && 'requestId' in body
    ? String(body.requestId)
    : undefined
  const resolvedIdempotencyKey = idempotencyKey === undefined ? bodyRequestId : idempotencyKey
  if (resolvedIdempotencyKey) headers.set('x-idempotency-key', resolvedIdempotencyKey)

  return new Request('http://localhost/api/profile/exam-policy/tyt-social', {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('TYT Social exam-policy route', () => {
  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('TYT_SOCIAL_V2_LEARNER_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    check.mockResolvedValue({ success: true })
  })

  test('returns 503 and no-store while the server learner rollout is disabled', async () => {
    vi.stubEnv('TYT_SOCIAL_V2_LEARNER_ENABLED', 'false')
    const response = await GET(request() as never)
    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(getUser).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('fails closed when only one rollout flag is enabled', async () => {
    vi.stubEnv('TYT_SOCIAL_V2_LEARNER_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'false')
    const response = await GET(request() as never)
    expect(response.status).toBe(503)
    expect(rpc).not.toHaveBeenCalled()
  })

  test('GET uses the authenticated cookie client and returns private no-store data', async () => {
    rpc.mockResolvedValue({ data: active, error: null })

    const response = await GET(request() as never)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(rpc).toHaveBeenCalledWith('get_my_tyt_social_exam_policy')
    expect(await response.json()).toEqual(active)
  })

  test('unauthenticated GET returns 401 without calling an RPC', async () => {
    getUser.mockResolvedValue({ data: { user: null } })

    const response = await GET(request() as never)

    expect(response.status).toBe(401)
    expect(rpc).not.toHaveBeenCalled()
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })

  test('PUT rejects unknown fields and invalid variants before auth or RPC', async () => {
    const response = await PUT(request('PUT', {
      variant: 'questions_16_20',
      requestId: '72d5f51d-4327-4f5c-a9d0-5fe49a9cdbf0',
      noticeVersion: 'client-controlled',
    }) as never)

    expect(response.status).toBe(400)
    expect(getUser).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('PUT rejects a header and body idempotency mismatch before auth or RPC', async () => {
    const response = await PUT(request('PUT', {
      variant: 'questions_16_20',
      requestId: '72d5f51d-4327-4f5c-a9d0-5fe49a9cdbf0',
    }, '82d5f51d-4327-4f5c-a9d0-5fe49a9cdbf0') as never)

    expect(response.status).toBe(400)
    expect(getUser).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  test('PUT fixes the notice version server-side and does not send a user id', async () => {
    rpc.mockResolvedValue({ data: { ...active, replayed: false }, error: null })

    const response = await PUT(request('PUT', {
      variant: 'questions_21_25',
      requestId: '72d5f51d-4327-4f5c-a9d0-5fe49a9cdbf0',
    }) as never)

    expect(response.status).toBe(200)
    expect(rpc).toHaveBeenCalledWith('set_my_tyt_social_exam_policy', {
      p_variant: 'questions_21_25',
      p_notice_version: 'tyt-social-choice-notice-v1',
      p_request_id: '72d5f51d-4327-4f5c-a9d0-5fe49a9cdbf0',
    })
  })

  test('rate-limit backend failures fail closed with 503 and Retry-After', async () => {
    check.mockResolvedValueOnce({ success: false, reason: 'backend_unavailable', retryAfter: 17 })

    const response = await GET(request() as never)

    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('17')
    expect(rpc).not.toHaveBeenCalled()
  })

  test('database selection cap is exposed as a generic 429 without logging details', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '55000', message: 'TYT Social policy selection rate limit exceeded' },
    })

    const response = await PUT(request('PUT', {
      variant: 'questions_16_20',
      requestId: '72d5f51d-4327-4f5c-a9d0-5fe49a9cdbf0',
    }) as never)

    expect(response.status).toBe(429)
    expect(await response.json()).toEqual({ error: 'Çok fazla istek' })
  })

  test('database validation failures remain a generic 400 response', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'replay differs' } })

    const response = await PUT(request('PUT', {
      variant: 'questions_16_20',
      requestId: '72d5f51d-4327-4f5c-a9d0-5fe49a9cdbf0',
    }) as never)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Geçersiz istek' })
  })

  test('unexpected RPC payloads fail closed', async () => {
    rpc.mockResolvedValue({ data: { ...active, rulesSha256: 'unexpected' }, error: null })

    const response = await GET(request() as never)

    expect(response.status).toBe(503)
  })
})

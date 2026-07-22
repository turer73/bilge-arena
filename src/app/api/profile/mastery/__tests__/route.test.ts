import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetUser,
  mockIpCheck,
  mockUserCheck,
  mockOutcomeResult,
  mockStateResult,
  mockOutcomeEq,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(async () => ({ data: { user: null as null | { id: string } } })),
  mockIpCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockUserCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockOutcomeResult: vi.fn(),
  mockStateResult: vi.fn(),
  mockOutcomeEq: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => ({
    check: name === 'mastery-map-user' ? mockUserCheck : mockIpCheck,
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'curriculum_outcomes') {
        const builder: Record<string, unknown> = {}
        builder.eq = vi.fn((column: string, value: unknown) => {
          mockOutcomeEq(column, value)
          return builder
        })
        builder.order = vi.fn(() => mockOutcomeResult())
        return { select: vi.fn(() => builder) }
      }
      if (table === 'user_outcome_state') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({ in: vi.fn(() => mockStateResult()) })),
          })),
        }
      }
      return {}
    }),
  })),
}))

import { GET } from '../route'

const USER_ID = '11111111-2222-3333-4444-555555555555'
const OUTCOME_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

function request(query = 'game=matematik&exam_ref=TYT') {
  return new Request(`http://localhost/api/profile/mastery?${query}`, {
    headers: { 'x-forwarded-for': '1.2.3.4' },
  })
}

describe('GET /api/profile/mastery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockOutcomeResult.mockResolvedValue({ data: [], error: null })
    mockStateResult.mockResolvedValue({ data: [], error: null })
  })

  it('auth yoksa 401 doner', async () => {
    const response = await GET(request() as never)
    expect(response.status).toBe(401)
  })

  it('gecersiz oyun ve exam_ref parametrelerini reddeder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    expect((await GET(request('game=bilinmeyen') as never)).status).toBe(400)
    expect((await GET(request('game=matematik&exam_ref=%3Cscript%3E') as never)).status).toBe(400)
  })

  it('pilot outcome yoksa bos ve no-store doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const response = await GET(request() as never)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toMatchObject({
      game: 'matematik',
      examRef: 'TYT',
      outcomes: [],
      pilot: true,
    })
  })

  it('ham kanittan aciklanabilir mastery ozeti uretir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockOutcomeResult.mockResolvedValue({
      data: [{
        id: OUTCOME_ID,
        code: 'MAT-SAY-01',
        game: 'matematik',
        category: 'sayilar',
        title: 'Sayılar ve işlem becerisi (pilot)',
        description: 'Pilot',
        exam_ref: 'TYT',
      }],
      error: null,
    })
    mockStateResult.mockResolvedValue({
      data: [{
        outcome_id: OUTCOME_ID,
        attempts: 5,
        correct_attempts: 4,
        weighted_earned: '4.000',
        weighted_possible: '5.000',
        delayed_correct: 1,
        last_answered_at: '2026-07-22T08:00:00Z',
      }],
      error: null,
    })

    const response = await GET(request() as never)
    const body = await response.json()
    expect(body.outcomes[0]).toMatchObject({
      code: 'MAT-SAY-01',
      attempts: 5,
      accuracy: 80,
      delayedCorrect: 1,
      status: 'mastered',
    })
    expect(JSON.stringify(body)).not.toContain(USER_ID)
  })

  it('exam_ref degerini normalize edip server sorgusuna uygular', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    await GET(request('game=matematik&exam_ref=tyt') as never)
    expect(mockOutcomeEq).toHaveBeenCalledWith('exam_ref', 'TYT')
  })

  it('DB ayrintisini sizdirmeden 500 doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockOutcomeResult.mockResolvedValue({
      data: null,
      error: { code: 'PGRST500', message: 'permission denied curriculum_outcomes' },
    })
    const response = await GET(request() as never)
    const body = await response.json()
    expect(response.status).toBe(500)
    expect(body.error).toBe('Sorgu basarisiz')
    expect(JSON.stringify(body)).not.toContain('permission denied')
  })

  it('IP limit auth sorgusundan once calisir', async () => {
    mockIpCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 })
    const response = await GET(request() as never)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('auth kullanicisini user rate limit ile korur', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockUserCheck.mockResolvedValueOnce({ success: false, retryAfter: 15 })
    const response = await GET(request() as never)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(mockUserCheck).toHaveBeenCalledWith(USER_ID)
  })
})

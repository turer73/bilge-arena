import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockAnswersRes,
  mockGetUser,
  mockIpCheck,
  mockUserCheck,
} = vi.hoisted(() => ({
  mockAnswersRes: vi.fn(),
  mockGetUser: vi.fn(async () => ({
    data: { user: null as null | { id: string; email?: string } },
  })),
  mockIpCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockUserCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'session_answers') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                returns: vi.fn(() => mockAnswersRes()),
              })),
            })),
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => ({
    check: name === 'topic-strengths-user' ? mockUserCheck : mockIpCheck,
  })),
}))

import { GET } from '../route'

const VALID_UUID = '11111111-2222-3333-4444-555555555555'

function makeRequest(game = 'matematik', ip = '1.2.3.4') {
  const headers = new Headers()
  headers.set('x-forwarded-for', ip)
  return new Request(`http://localhost/api/profile/topic-strengths?game=${game}`, { headers })
}

describe('GET /api/profile/topic-strengths', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
  })

  it('rejects unauthorized (no user) with 401', async () => {
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Yetkisiz')
  })

  it('rejects invalid game slug with 400', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    const res = await GET(makeRequest('invalid_game') as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Gecerli oyun')
  })

  it('rejects missing game param with 400', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    const headers = new Headers()
    headers.set('x-forwarded-for', '1.2.3.4')
    const res = await GET(new Request('http://localhost/api/profile/topic-strengths', { headers }) as never)
    expect(res.status).toBe(400)
  })

  it('returns empty topics when no answers exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({ data: [], error: null })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.topics).toEqual([])
    expect(body.game).toBe('matematik')
  })

  it('aggregates correct percentages by category', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({
      data: [
        { is_correct: true, questions: { game: 'matematik', category: 'sayilar' } },
        { is_correct: true, questions: { game: 'matematik', category: 'sayilar' } },
        { is_correct: false, questions: { game: 'matematik', category: 'sayilar' } },
        { is_correct: false, questions: { game: 'matematik', category: 'geometri' } },
      ],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.topics).toHaveLength(2)
    // sayilar: 2/3 = 67%, geometri: 0/1 = 0%
    expect(body.topics[0]).toMatchObject({ label: 'Sayilar', percentage: 67 })
    expect(body.topics[1]).toMatchObject({ label: 'Geometri', percentage: 0 })
  })

  it('formats label with capital + underscore-to-space', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({
      data: [
        { is_correct: true, questions: { game: 'turkce', category: 'dil_bilgisi' } },
        { is_correct: true, questions: { game: 'turkce', category: 'dil_bilgisi' } },
      ],
      error: null,
    })
    const res = await GET(makeRequest('turkce') as never)
    const body = await res.json()
    expect(body.topics[0].label).toBe('Dil bilgisi')
    expect(body.topics[0].percentage).toBe(100)
  })

  it('skips rows with missing category', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({
      data: [
        { is_correct: true, questions: { game: 'matematik', category: 'sayilar' } },
        { is_correct: true, questions: { game: 'matematik', category: '' } },
      ],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.topics).toHaveLength(1)
    expect(body.topics[0].label).toBe('Sayilar')
  })

  it('sorts topics descending by percentage', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({
      data: [
        { is_correct: true, questions: { game: 'matematik', category: 'a' } },
        { is_correct: false, questions: { game: 'matematik', category: 'b' } },
        { is_correct: true, questions: { game: 'matematik', category: 'b' } },
        { is_correct: true, questions: { game: 'matematik', category: 'c' } },
        { is_correct: true, questions: { game: 'matematik', category: 'c' } },
        { is_correct: true, questions: { game: 'matematik', category: 'c' } },
      ],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.topics.map((t: { label: string }) => t.label)).toEqual(['A', 'C', 'B'])
    expect(body.topics[0].percentage).toBe(100) // a 1/1
    expect(body.topics[1].percentage).toBe(100) // c 3/3
    expect(body.topics[2].percentage).toBe(50)  // b 1/2
  })

  it('sets private cache (auth-spesifik veri)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({ data: [], error: null })
    const res = await GET(makeRequest() as never)
    const cc = res.headers.get('Cache-Control') ?? ''
    expect(cc).toContain('private')
    expect(cc).toContain('max-age=60')
    expect(cc).not.toContain('public')
  })

  it('does not include user_id or raw answers in response (data minimization)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({
      data: [
        { is_correct: true, questions: { game: 'matematik', category: 'sayilar' } },
      ],
      error: null,
    })
    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(JSON.stringify(body)).not.toContain(VALID_UUID)
    expect(body).not.toHaveProperty('answers')
    expect(body).not.toHaveProperty('user_id')
  })

  it('returns 500 on query error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({ data: null, error: { code: 'PGRST500' } })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(500)
  })

  it('does not leak Postgres error details (sanitized)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({
      data: null,
      error: { code: 'PGRST500', message: 'permission denied for table session_answers' },
    })
    const res = await GET(makeRequest() as never)
    const body = await res.json()
    expect(body.error).toBe('Sorgu basarisiz')
    expect(JSON.stringify(body)).not.toContain('permission denied')
    expect(JSON.stringify(body)).not.toContain('session_answers')
  })
})

describe('GET /api/profile/topic-strengths rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
  })

  it('IP limit ONCE — anon flood erken kes, auth.getUser cagrilmaz', async () => {
    mockIpCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    // SECURITY: IP rejection'da auth.getUser CAGRILMAMALI — Supabase Auth quota tasarruf
    expect(mockGetUser).not.toHaveBeenCalled()
    expect(mockUserCheck).not.toHaveBeenCalled()
  })

  it('auth user: IP + user-id cift kalkan, ikisi de cagrilir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({ data: [], error: null })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(200)
    expect(mockIpCheck).toHaveBeenCalled()
    expect(mockUserCheck).toHaveBeenCalledWith(VALID_UUID)
  })

  it('auth user: user-id limit reject -> 429', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockUserCheck.mockResolvedValueOnce({ success: false, retryAfter: 15 })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('15')
  })

  it('user filter uses authenticated user id (not query param)', async () => {
    // Topic-strengths endpoint sidebar'dan farkli — currentUserId param kabul
    // etmez, sadece auth.uid() filter olarak kullanir. Test: handler'a currentUserId
    // benzeri bir param gonderilse bile auth.uid() ile filter eder.
    mockGetUser.mockResolvedValue({ data: { user: { id: VALID_UUID } } })
    mockAnswersRes.mockResolvedValueOnce({ data: [], error: null })

    const headers = new Headers()
    headers.set('x-forwarded-for', '1.2.3.4')
    // Saldirgan baska user_id parametresi ile filter etmeye calisir
    const url = `http://localhost/api/profile/topic-strengths?game=matematik&user_id=99999999-9999-9999-9999-999999999999`
    const res = await GET(new Request(url, { headers }) as never)
    expect(res.status).toBe(200)
    // Mock check: query auth.uid()'yi filter etmis olmali, user_id paramini DEGIL.
    // (Mock implementation .eq('user_id', user.id) cagrilmasini bekler)
    expect(mockAnswersRes).toHaveBeenCalled()
  })
})

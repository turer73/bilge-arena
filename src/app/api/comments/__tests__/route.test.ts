import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  mockGetUser,
  mockCommentsList,
  mockLikesList,
  mockInsertComment,
  mockDedupCheck,
  mockRateLimitCheck,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockCommentsList: vi.fn(),
  mockLikesList: vi.fn(),
  mockInsertComment: vi.fn(),
  mockDedupCheck: vi.fn(),
  mockRateLimitCheck: vi.fn(async () => ({ success: true })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

/**
 * Servis-role mock: comments tablosu için 3 farklı zincir:
 *   1) GET liste: .select(long).eq.eq.order.limit.returns
 *   2) POST dedup: .select('id').eq.eq.eq.eq.gte.limit.maybeSingle
 *   3) POST insert: .insert().select().single
 */
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'comments') {
        return {
          select: vi.fn((cols: string) => {
            // GET listesi — uzun select string
            if (cols !== 'id') {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({ returns: mockCommentsList })),
                    })),
                  })),
                })),
              }
            }
            // POST dedup — select('id') zinciri
            const dedupChain: Record<string, unknown> = {}
            const makeEqChain = (): typeof dedupChain => ({
              eq: vi.fn(() => makeEqChain()),
              gte: vi.fn(() => ({
                limit: vi.fn(() => ({ maybeSingle: mockDedupCheck })),
              })),
            })
            return makeEqChain()
          }),
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: mockInsertComment,
            })),
          })),
        }
      }
      if (table === 'comment_likes') {
        return {
          select: vi.fn(() => ({
            eq: mockLikesList,
          })),
        }
      }
      return {}
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: mockRateLimitCheck,
  })),
}))

import { GET, POST } from '../route'

const VALID_UUID = '12345678-1234-1234-1234-123456789012'

function makeGet(questionId?: string) {
  const url = new URL('http://localhost/api/comments')
  if (questionId) url.searchParams.set('questionId', questionId)
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request(url.toString(), { headers })
}

function makePost(body: unknown) {
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  headers.set('Content-Type', 'application/json')
  return new Request('http://localhost/api/comments', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('GET /api/comments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 if questionId missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGet() as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 if questionId invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGet('not-a-uuid') as never)
    expect(res.status).toBe(400)
  })

  it('returns 429 on IP rate limit', async () => {
    mockRateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 } as never)
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeGet(VALID_UUID) as never)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
  })

  it('returns comments without likes for anon user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockCommentsList.mockResolvedValue({
      data: [
        {
          id: 'c1', content: 'hi', likes_count: 5, created_at: '2026-05-17',
          user_id: 'other-user',
          profiles: { username: 'ali', display_name: null, avatar_url: null, level_name: 'Cirak' },
        },
      ],
      error: null,
    })

    const res = await GET(makeGet(VALID_UUID) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.comments).toHaveLength(1)
    expect(body.comments[0].is_liked).toBe(false)
    expect(body.comments[0].is_own).toBe(false)
  })

  it('marks own comments and liked comments for auth user', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockCommentsList.mockResolvedValue({
      data: [
        {
          id: 'c1', content: 'mine', likes_count: 0, created_at: '2026-05-17',
          user_id: 'u1',
          profiles: { username: 'ben', display_name: null, avatar_url: null, level_name: 'Usta' },
        },
        {
          id: 'c2', content: 'liked', likes_count: 3, created_at: '2026-05-17',
          user_id: 'other-user',
          profiles: { username: 'ali', display_name: null, avatar_url: null, level_name: 'Acemi' },
        },
      ],
      error: null,
    })
    mockLikesList.mockResolvedValue({ data: [{ comment_id: 'c2' }], error: null })

    const res = await GET(makeGet(VALID_UUID) as never)
    const body = await res.json()
    expect(body.comments[0].is_own).toBe(true)
    expect(body.comments[0].is_liked).toBe(false)
    expect(body.comments[1].is_own).toBe(false)
    expect(body.comments[1].is_liked).toBe(true)
  })

  it('returns 500 on comments query error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockCommentsList.mockResolvedValue({ data: null, error: { code: '42501' } })
    const res = await GET(makeGet(VALID_UUID) as never)
    expect(res.status).toBe(500)
  })
})

describe('POST /api/comments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Varsayılan: dedup yok, insert OK
    mockDedupCheck.mockResolvedValue({ data: null, error: null })
    mockInsertComment.mockResolvedValue({
      data: { id: 'new-comment-id', created_at: '2026-05-17T00:00:00Z' },
      error: null,
    })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makePost({ questionId: VALID_UUID, content: 'test' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 if questionId invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makePost({ questionId: 'not-a-uuid', content: 'test' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 if content empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makePost({ questionId: VALID_UUID, content: '   ' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 if content too long', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makePost({ questionId: VALID_UUID, content: 'x'.repeat(501) }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 429 on IP rate limit', async () => {
    mockRateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 60 } as never)
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makePost({ questionId: VALID_UUID, content: 'merhaba' }) as never)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('60')
  })

  it('returns 429 on user rate limit', async () => {
    mockRateLimitCheck
      .mockResolvedValueOnce({ success: true })  // IP geçer
      .mockResolvedValueOnce({ success: false, retryAfter: 45 } as never) // user fail
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makePost({ questionId: VALID_UUID, content: 'merhaba' }) as never)
    expect(res.status).toBe(429)
  })

  it('returns 409 if duplicate comment within 60 min (H-149-2)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockDedupCheck.mockResolvedValue({ data: { id: 'existing-id' }, error: null })
    const res = await POST(makePost({ questionId: VALID_UUID, content: 'ayni yorum' }) as never)
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/zaten/)
  })

  it('creates comment and returns 201', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makePost({ questionId: VALID_UUID, content: 'hello' }) as never)
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe('new-comment-id')
  })

  it('returns 500 on insert error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockInsertComment.mockResolvedValue({ data: null, error: { code: '23505' } })
    const res = await POST(makePost({ questionId: VALID_UUID, content: 'hello' }) as never)
    expect(res.status).toBe(500)
  })
})

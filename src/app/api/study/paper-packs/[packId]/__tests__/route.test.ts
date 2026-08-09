import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '../route'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  rateLimitCheck: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mocks.rpc })),
}))
vi.mock('@/lib/paper-mode/rate-limits', () => ({
  paperPackReadLimiter: { check: mocks.rateLimitCheck },
}))

const USER_ID = '11111111-2222-4333-8444-555555555555'
const PACK_ID = 'cccccccc-dddd-4eee-8fff-000000000000'
const QUESTION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const oldFlag = process.env.PAPER_MODE_ENABLED
const active = {
  packId: PACK_ID,
  status: 'active',
  createdAt: '2026-08-09T10:00:00.000+00:00',
  expiresAt: '2026-08-16T10:00:00.000+00:00',
  submittedAt: null,
  plan: { game: 'matematik', planDate: '2026-08-09', examRef: 'TYT' },
  items: [{
    position: 1,
    question: {
      id: QUESTION_ID,
      game: 'matematik',
      category: null,
      topic: 'Sayılar',
      difficulty: 2,
      content: { question: '2 + 2 kaçtır?', options: ['3', '4'] },
    },
    selectedOption: null,
    isCorrect: null,
    correctOption: null,
  }],
  summary: null,
  mastery: { source: 'paper', weight: 0.5 },
  reward: { xp: 0, coins: 0, socialPoints: 0 },
  privacy: { ownerOnly: true, privateCacheDisabled: true },
}

describe('paper pack read route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.PAPER_MODE_ENABLED = 'true'
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mocks.rateLimitCheck.mockResolvedValue({ success: true })
  })

  afterAll(() => {
    if (oldFlag === undefined) delete process.env.PAPER_MODE_ENABLED
    else process.env.PAPER_MODE_ENABLED = oldFlag
  })

  it('fails closed, requires auth, and validates pack UUID', async () => {
    delete process.env.PAPER_MODE_ENABLED
    expect((await GET(new Request('http://local'), { params: Promise.resolve({ packId: PACK_ID }) })).status).toBe(503)

    process.env.PAPER_MODE_ENABLED = 'true'
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(new Request('http://local'), { params: Promise.resolve({ packId: PACK_ID }) })).status).toBe(401)
    expect((await GET(new Request('http://local'), { params: Promise.resolve({ packId: 'bad' }) })).status).toBe(400)
  })

  it('enforces rate limit before RPC', async () => {
    mocks.rateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 11 })
    const response = await GET(new Request('http://local'), { params: Promise.resolve({ packId: PACK_ID }) })
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('11')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns a strict owner-only answer-free pack without caching', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: active, error: null })
    const response = await GET(new Request('http://local'), { params: Promise.resolve({ packId: PACK_ID }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('get_my_paper_study_pack', {
      p_user_id: USER_ID,
      p_pack_id: PACK_ID,
    })
    expect(JSON.stringify(await response.json())).not.toMatch(/answer|solution|correctOption":\d/)
  })

  it('rejects a DB payload that leaks a private answer', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        ...active,
        items: [{
          ...active.items[0],
          question: {
            ...active.items[0].question,
            content: { ...active.items[0].question.content, answer: 1 },
          },
        }],
      },
      error: null,
    })
    expect((await GET(new Request('http://local'), { params: Promise.resolve({ packId: PACK_ID }) })).status).toBe(500)
  })
})

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '../route'

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
  paperPackSubmitLimiter: { check: mocks.rateLimitCheck },
}))

const USER_ID = '11111111-2222-4333-8444-555555555555'
const PACK_ID = 'cccccccc-dddd-4eee-8fff-000000000000'
const REQUEST_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const QUESTION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const oldFlag = process.env.PAPER_MODE_ENABLED
const submitted = {
  packId: PACK_ID,
  status: 'submitted',
  createdAt: '2026-08-09T10:00:00.000+00:00',
  expiresAt: '2026-08-16T10:00:00.000+00:00',
  submittedAt: '2026-08-09T11:00:00.000+00:00',
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
    selectedOption: 1,
    isCorrect: true,
    correctOption: 1,
  }],
  summary: { answeredCount: 1, correctCount: 1, scorePercent: 100 },
  mastery: { source: 'paper', weight: 0.5 },
  reward: { xp: 0, coins: 0, socialPoints: 0 },
  privacy: { ownerOnly: true, privateCacheDisabled: true },
}
const active = {
  ...submitted,
  status: 'active',
  submittedAt: null,
  items: submitted.items.map((item) => ({
    ...item,
    selectedOption: null,
    isCorrect: null,
    correctOption: null,
  })),
  summary: null,
}

function request(body: unknown) {
  return new Request(`http://local/api/study/paper-packs/${PACK_ID}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('paper pack submit route', () => {
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

  it('fails closed, requires auth, and rejects mass-assignment', async () => {
    delete process.env.PAPER_MODE_ENABLED
    expect((await POST(request({}), { params: Promise.resolve({ packId: PACK_ID }) })).status).toBe(503)

    process.env.PAPER_MODE_ENABLED = 'true'
    mocks.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(request({}), { params: Promise.resolve({ packId: PACK_ID }) })).status).toBe(401)

    expect((await POST(request({
      requestId: REQUEST_ID,
      answers: [{ position: 1, selectedOption: 1, correctOption: 1 }],
    }), { params: Promise.resolve({ packId: PACK_ID }) })).status).toBe(400)
  })

  it('enforces the submit limiter before mutation', async () => {
    mocks.rateLimitCheck.mockResolvedValueOnce({ success: false, retryAfter: 19 })
    const response = await POST(request({
      requestId: REQUEST_ID,
      answers: [{ position: 1, selectedOption: 1 }],
    }), { params: Promise.resolve({ packId: PACK_ID }) })
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('19')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('submits owner answers then loads the strict canonical result', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: active, error: null })
      .mockResolvedValueOnce({
        data: { packId: PACK_ID, summary: submitted.summary, replayed: false },
        error: null,
      })
      .mockResolvedValueOnce({ data: submitted, error: null })

    const response = await POST(request({
      requestId: REQUEST_ID,
      answers: [{ position: 1, selectedOption: 1 }],
    }), { params: Promise.resolve({ packId: PACK_ID }) })
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'submit_paper_study_pack', {
      p_user_id: USER_ID,
      p_pack_id: PACK_ID,
      p_answers: [{ questionId: QUESTION_ID, selectedOptionIndex: 1 }],
      p_request_id: REQUEST_ID,
    })
    expect(await response.json()).toEqual({ pack: submitted, replayed: false })
  })

  it('does not accept an invalid receipt or non-submitted reload', async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: active, error: null })
      .mockResolvedValueOnce({
        data: { packId: PACK_ID, summary: submitted.summary, replayed: false, userId: USER_ID },
        error: null,
      })
    expect((await POST(request({
      requestId: REQUEST_ID,
      answers: [{ position: 1, selectedOption: null }],
    }), { params: Promise.resolve({ packId: PACK_ID }) })).status).toBe(500)
  })

  it('rejects answer counts and option indexes that do not match the owner pack', async () => {
    mocks.rpc.mockResolvedValue({ data: active, error: null })
    const missing = await POST(request({
      requestId: REQUEST_ID,
      answers: [],
    }), { params: Promise.resolve({ packId: PACK_ID }) })
    expect(missing.status).toBe(400)

    const outOfRange = await POST(request({
      requestId: REQUEST_ID,
      answers: [{ position: 1, selectedOption: 2 }],
    }), { params: Promise.resolve({ packId: PACK_ID }) })
    expect(outOfRange.status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalledWith('submit_paper_study_pack', expect.anything())
  })
})

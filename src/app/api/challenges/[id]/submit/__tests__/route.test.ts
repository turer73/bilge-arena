import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ──────────────────────────────────────────

const mockGetUser = vi.fn()
const mockChallengeSingle = vi.fn()
const mockQuestionsIn = vi.fn()
// Atomik submit RPC. Varsayilan: waiting_opponent.
const mockRpc = vi.fn(async (fn: string, _args?: Record<string, unknown>) => {
  if (fn === 'submit_challenge_answer') {
    return { data: { ok: true, result: 'waiting_opponent' } as Record<string, unknown>, error: null as { code: string } | null }
  }
  return { data: null, error: null }
})

const mockSvcFrom = vi.fn((table: string) => {
  if (table === 'challenges') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          or: vi.fn(() => ({ maybeSingle: mockChallengeSingle })),
        })),
      })),
    }
  }
  if (table === 'questions') {
    return { select: vi.fn(() => ({ in: mockQuestionsIn })) }
  }
  throw new Error(`unexpected table ${table}`)
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: mockSvcFrom,
    rpc: mockRpc,
  }),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

import { POST } from '../route'

// ─── Helpers ────────────────────────────────────────

const Q1 = '10000000-0000-4000-8000-000000000001'
const Q2 = '10000000-0000-4000-8000-000000000002'
const FOREIGN_Q = '10000000-0000-4000-8000-0000000000ff'
const CHALLENGE_ID = '20000000-0000-4000-8000-000000000001'
const USER_ID = 'user-1'
const OPPONENT_ID = 'user-2'

// Ayristiricidan (parseQuestionRows) gecen tam soru satiri.
function questionRow(id: string, answer: number) {
  return {
    id, external_id: null, game: 'matematik', category: 'sayilar', subcategory: null, topic: null,
    difficulty: 2, level_tag: null,
    content: { question: `Soru ${id}`, options: ['A', 'B', 'C', 'D'], answer },
    base_points: 20, is_active: true, is_boss: false, times_answered: 0, times_correct: 0,
    source: null, exam_ref: null, published_revision_id: null, created_at: null, updated_at: null,
  }
}

function makeRequest(body: Record<string, unknown>, id = CHALLENGE_ID) {
  return new NextRequest(`http://localhost/api/challenges/${id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validAnswers = [
  { questionId: Q1, selectedOption: 1, isCorrect: true, timeTaken: 5 },
  { questionId: Q2, selectedOption: 0, isCorrect: false, timeTaken: 10 },
]

const openChallenge = {
  id: CHALLENGE_ID,
  status: 'accepted',
  challenger_id: USER_ID,
  opponent_id: OPPONENT_ID,
  challenger_score: null,
  opponent_score: null,
  question_ids: [Q1, Q2],
  xp_reward: 50,
}

const params = (id = CHALLENGE_ID) => ({ params: Promise.resolve({ id }) })

function submitArgs() {
  const call = mockRpc.mock.calls.find(([fn]) => fn === 'submit_challenge_answer')
  return call?.[1] as { p_challenge_id: string; p_user_id: string; p_score: Record<string, unknown> } | undefined
}

// ─── Tests ──────────────────────────────────────────

describe('POST /api/challenges/[id]/submit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockChallengeSingle.mockResolvedValue({ data: openChallenge, error: null })
    mockQuestionsIn.mockResolvedValue({
      data: [questionRow(Q1, 1), questionRow(Q2, 2)],
      error: null,
    })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest({ answers: validAnswers }), params())
    expect(res.status).toBe(401)
  })

  it('returns 400 for a non-UUID challenge id', async () => {
    const res = await POST(makeRequest({ answers: validAnswers }, 'not-a-uuid'), params('not-a-uuid'))
    expect(res.status).toBe(400)
    expect(mockSvcFrom).not.toHaveBeenCalled()
  })

  it('returns 400 if answers array is empty or missing', async () => {
    expect((await POST(makeRequest({ answers: [] }), params())).status).toBe(400)
    expect((await POST(makeRequest({}), params())).status).toBe(400)
  })

  it('returns 404 if challenge not found', async () => {
    mockChallengeSingle.mockResolvedValue({ data: null, error: null })
    const res = await POST(makeRequest({ answers: validAnswers }), params())
    expect(res.status).toBe(404)
  })

  it('returns 400 if challenge already completed', async () => {
    mockChallengeSingle.mockResolvedValue({ data: { ...openChallenge, status: 'completed' }, error: null })
    const res = await POST(makeRequest({ answers: validAnswers }), params())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('tamamlanmis')
  })

  it('returns 400 if user already submitted', async () => {
    mockChallengeSingle.mockResolvedValue({
      data: { ...openChallenge, challenger_score: { correct: 2, total: 2, time_sec: 10 } },
      error: null,
    })
    const res = await POST(makeRequest({ answers: validAnswers }), params())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('gonderilmis')
  })

  it('scores only the challenge questions and returns waiting_opponent', async () => {
    const res = await POST(makeRequest({ answers: validAnswers }), params())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.result).toBe('waiting_opponent')
    expect(json.score.correct).toBe(1) // Q1 dogru, Q2 yanlis
    expect(json.score.total).toBe(2)
    expect(mockQuestionsIn).toHaveBeenCalledWith('id', [Q1, Q2])
  })

  it('client isCorrect yok sayilir — skor DB cevabindan hesaplanir', async () => {
    const lyingAnswers = [
      { questionId: Q1, selectedOption: 3, isCorrect: true, timeTaken: 1 },
      { questionId: Q2, selectedOption: 3, isCorrect: true, timeTaken: 1 },
    ]
    const res = await POST(makeRequest({ answers: lyingAnswers }), params())
    expect(res.status).toBe(200)
    expect((await res.json()).score.correct).toBe(0)
  })

  describe('cevap kumesi duellonun soru kumesiyle birebir (disc #2530)', () => {
    it('yabanci soruyla gonderimi reddeder ve RPC cagirmaz', async () => {
      const res = await POST(makeRequest({
        answers: [
          { questionId: Q1, selectedOption: 1 },
          { questionId: FOREIGN_Q, selectedOption: 0 },
        ],
      }), params())
      expect(res.status).toBe(400)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('eksik cevapli (alt kume) gonderimi reddeder', async () => {
      const res = await POST(makeRequest({ answers: [{ questionId: Q1, selectedOption: 1 }] }), params())
      expect(res.status).toBe(400)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('fazladan yabanci soru eklenmis tam kumeyi reddeder', async () => {
      const res = await POST(makeRequest({
        answers: [...validAnswers, { questionId: FOREIGN_Q, selectedOption: 0 }],
      }), params())
      expect(res.status).toBe(400)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('ayni soruyu tekrar gondereni reddeder (skor sisirme)', async () => {
      const dupAnswers = [
        { questionId: Q1, selectedOption: 1 },
        { questionId: Q1, selectedOption: 1 },
      ]
      const res = await POST(makeRequest({ answers: dupAnswers }), params())
      expect(res.status).toBe(400)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('soru kumesi bos duelloyu reddeder', async () => {
      mockChallengeSingle.mockResolvedValue({ data: { ...openChallenge, question_ids: [] }, error: null })
      const res = await POST(makeRequest({ answers: validAnswers }), params())
      expect(res.status).toBe(400)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('bankadan kaldirilmis soru GET gibi kumeden duser; oyuncu gormedigi soruya cevap vermez', async () => {
      mockQuestionsIn.mockResolvedValue({ data: [questionRow(Q1, 1)], error: null })
      const res = await POST(makeRequest({ answers: [{ questionId: Q1, selectedOption: 1 }] }), params())
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.score.correct).toBe(1)
      expect(json.score.total).toBe(1)
      expect(submitArgs()?.p_score).toEqual({ correct: 1, total: 1, xp: 20 })
    })

    it('kaldirilmis soruya da cevap gonderen istegi reddeder', async () => {
      mockQuestionsIn.mockResolvedValue({ data: [questionRow(Q1, 1)], error: null })
      const res = await POST(makeRequest({ answers: validAnswers }), params())
      expect(res.status).toBe(400)
      expect(mockRpc).not.toHaveBeenCalled()
    })

    it('icerigi gecersiz soruyu GET ile ayni bicimde kumeden dusurur', async () => {
      mockQuestionsIn.mockResolvedValue({
        data: [questionRow(Q1, 1), { ...questionRow(Q2, 2), content: { question: 'bozuk' } }],
        error: null,
      })
      const res = await POST(makeRequest({ answers: [{ questionId: Q1, selectedOption: 0 }] }), params())
      expect(res.status).toBe(200)
      expect((await res.json()).score).toMatchObject({ correct: 0, total: 1 })
    })

    it('soru sorgusu hata verirse 500 doner ve RPC cagirmaz', async () => {
      mockQuestionsIn.mockResolvedValue({ data: null, error: { code: '08006' } })
      const res = await POST(makeRequest({ answers: validAnswers }), params())
      expect(res.status).toBe(500)
      expect(mockRpc).not.toHaveBeenCalled()
    })
  })

  describe('sure ve RPC sozlesmesi', () => {
    it('istemci suresini RPC ye gondermez; sure sunucuda olculur', async () => {
      await POST(makeRequest({ answers: validAnswers }), params())
      const args = submitArgs()
      expect(args).toEqual({
        p_challenge_id: CHALLENGE_ID,
        p_user_id: USER_ID,
        p_score: { correct: 1, total: 2, xp: 20 },
      })
      expect(args?.p_score).not.toHaveProperty('time_sec')
    })

    it('timeTaken gondermeyen istemciyi kabul eder', async () => {
      const res = await POST(makeRequest({
        answers: [{ questionId: Q1, selectedOption: 1 }, { questionId: Q2, selectedOption: 2 }],
      }), params())
      expect(res.status).toBe(200)
      expect((await res.json()).score.correct).toBe(2)
    })

    it('RPC nin dondurdugu sunucu skorunu, sonucu ve verilen XP yi iletir', async () => {
      mockRpc.mockImplementationOnce(async () => ({
        data: {
          ok: true,
          result: 'completed',
          winnerId: USER_ID,
          xpAwarded: 50,
          score: { correct: 1, total: 2, time_sec: 37, xp: 20 },
        },
        error: null,
      }))
      const json = await (await POST(makeRequest({ answers: validAnswers }), params())).json()
      expect(json).toEqual({
        score: { correct: 1, total: 2, time_sec: 37, xp: 20 },
        result: 'completed',
        winnerId: USER_ID,
        xpAwarded: 50,
      })
    })

    it('XP tavanina takilan galibiyette xpAwarded 0 doner', async () => {
      mockRpc.mockImplementationOnce(async () => ({
        data: { ok: true, result: 'completed', winnerId: USER_ID, xpAwarded: 0 },
        error: null,
      }))
      const json = await (await POST(makeRequest({ answers: validAnswers }), params())).json()
      expect(json.winnerId).toBe(USER_ID)
      expect(json.xpAwarded).toBe(0)
    })

    it('xpAwarded dondurmeyen eski RPC de istemciye null iletir', async () => {
      mockRpc.mockImplementationOnce(async () => ({
        data: { ok: true, result: 'completed', winnerId: USER_ID },
        error: null,
      }))
      const json = await (await POST(makeRequest({ answers: validAnswers }), params())).json()
      expect(json.xpAwarded).toBeNull()
    })

    it.each([
      ['expired', 400, 'suresi dolmus'],
      ['invalid_score', 400, 'eslesmiyor'],
      ['already_submitted', 400, 'gonderilmis'],
      ['not_participant', 403, 'katilimci'],
      ['not_found', 404, 'bulunamadi'],
    ])('RPC hatasi %s -> %i', async (code, status, message) => {
      mockRpc.mockImplementationOnce(async () => ({ data: { ok: false, error: code }, error: null }))
      const res = await POST(makeRequest({ answers: validAnswers }), params())
      expect(res.status).toBe(status)
      expect((await res.json()).error).toContain(message)
    })

    it('RPC yoksa atomik olmayan eski yola dusmez, hata doner', async () => {
      mockRpc.mockImplementationOnce(async () => ({ data: null as never, error: { code: 'PGRST202' } }))
      const res = await POST(makeRequest({ answers: validAnswers }), params())
      expect(res.status).toBeGreaterThanOrEqual(500)
      expect(mockRpc).toHaveBeenCalledTimes(1)
    })
  })
})

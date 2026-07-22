import { describe, it, expect, vi, beforeEach } from 'vitest'

// Esnek, sirali-kuyruklu query-builder mock: her .from(table) cagrisi kuyruktaki
// bir sonraki { data, error } sonucunu doner; her chain-metodu ayni objeyi
// dondurur (zincirlenebilir) VE .then() ile awaitable'dir (gercek supabase-js
// PostgrestFilterBuilder davranisi -- zincirin HERHANGI bir noktasinda await
// edilebilir). fetchReviewQuestions/fetchFsrsDueQuestions birden fazla farkli
// uzunlukta zincir kullaniyor (gte ile biten eski-yol vs order/limit ile biten
// FSRS-yolu) -- rigid sabit-zincir mock bunu karsilayamiyordu.
const { mockGetUser, mockRpc, mockHistory, sessionAnswersMock, questionsMock, otherTableMock } = vi.hoisted(() => {
  // function declaration (self-hoisting) -- vi.hoisted arrow-fn govdesinden
  // guvenle cagirilabilir.
  function makeTableMockHoisted() {
    const queue: { data: unknown; error: unknown }[] = []
    const push = (r: { data: unknown; error: unknown }) => queue.push(r)
    const from = vi.fn(() => {
      const result = queue.length > 0 ? queue.shift()! : { data: [], error: null }
      const chain: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'gte', 'order', 'limit']) {
        chain[m] = vi.fn(() => chain)
      }
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      return chain
    })
    return { from, push, reset: () => { queue.length = 0 } }
  }
  return {
    mockGetUser: vi.fn(),
    mockRpc: vi.fn(),
    // Klipper review B2: user_question_history server-side cooldown read
    mockHistory: vi.fn(async (): Promise<{ data: Array<{ question_id: string }>; error: null }> => ({
      data: [],
      error: null,
    })),
    sessionAnswersMock: makeTableMockHoisted(),
    questionsMock: makeTableMockHoisted(),
    otherTableMock: makeTableMockHoisted(),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn((table: string) => {
      if (table === 'user_question_history') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: mockHistory,
              })),
            })),
          })),
        }
      }
      if (table === 'session_answers') return sessionAnswersMock.from()
      if (table === 'questions') return questionsMock.from()
      return otherTableMock.from()
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ success: true })),
  })),
}))

import { GET } from '../route'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/questions/random')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const headers = new Headers()
  headers.set('x-forwarded-for', '1.2.3.4')
  return new Request(url.toString(), { headers })
}

describe('GET /api/questions/random', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionAnswersMock.reset()
    questionsMock.reset()
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 if game param missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeRequest() as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 if game param invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await GET(makeRequest({ game: 'invalid-game' }) as never)
    expect(res.status).toBe(400)
  })

  it('calls select_random_questions RPC with correct args', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })

    await GET(makeRequest({ game: 'matematik', limit: '10', category: 'cebir', difficulty: '3', examRef: 'TYT' }) as never)

    expect(mockRpc).toHaveBeenCalledWith('select_random_questions', expect.objectContaining({
      p_game: 'matematik',
      p_limit: 20, // limit*2 cap 50
      p_category: 'cebir',
      p_difficulty: 3,
      p_exam_ref: 'TYT',
    }))
  })

  it('returns questions list on success', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const fakeQuestions = [
      { id: 'q1', game: 'matematik' },
      { id: 'q2', game: 'matematik' },
    ]
    mockRpc.mockResolvedValue({ data: fakeQuestions, error: null })

    const res = await GET(makeRequest({ game: 'matematik', limit: '10' }) as never)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.questions).toEqual(fakeQuestions)
  })

  it('returns 500 on RPC error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501' } })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    expect(res.status).toBe(500)
  })

  it('caps limit at 100', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    await GET(makeRequest({ game: 'matematik', limit: '500' }) as never)
    // limit clamped to 100 -> fetchLimit = min(100*2, 50) = 50
    expect(mockRpc).toHaveBeenCalledWith('select_random_questions', expect.objectContaining({
      p_limit: 50,
    }))
  })

  it('filters excludeIds to valid UUIDs only (B3 strict regex)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const validId = '12345678-1234-1234-1234-123456789012'
    // B3: yanlis dash konumlu string'ler eski regex'e dusturuyordu, simdi reddedilmeli
    const malformedDash = '---------abc123def456abc123def456abc1'
    await GET(makeRequest({
      game: 'matematik',
      excludeIds: `${validId},invalid-id,not-a-uuid,${malformedDash}`,
    }) as never)
    expect(mockRpc).toHaveBeenCalledWith('select_random_questions', expect.objectContaining({
      p_exclude_ids: [validId],
    }))
  })

  it('B2: merges server-side user_question_history into excludeIds', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const historyId = '99999999-9999-4999-8999-999999999999'
    mockHistory.mockResolvedValueOnce({
      data: [{ question_id: historyId }],
      error: null,
    })

    const clientId = '12345678-1234-1234-1234-123456789012'
    await GET(makeRequest({ game: 'matematik', excludeIds: clientId }) as never)

    expect(mockRpc).toHaveBeenCalledWith(
      'select_random_questions',
      expect.objectContaining({
        p_exclude_ids: expect.arrayContaining([clientId, historyId]),
      }),
    )
  })

  it('B2: works when client excludeIds empty but history has entries', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const historyId = '99999999-9999-4999-8999-999999999999'
    mockHistory.mockResolvedValueOnce({
      data: [{ question_id: historyId }],
      error: null,
    })

    await GET(makeRequest({ game: 'matematik' }) as never)

    expect(mockRpc).toHaveBeenCalledWith(
      'select_random_questions',
      expect.objectContaining({
        p_exclude_ids: [historyId],
      }),
    )
  })

  it('sets Cache-Control no-store', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [], error: null })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })

  it('does not include reviewQuestions when includeReview=false', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: [{ id: 'q1' }], error: null })
    const res = await GET(makeRequest({ game: 'matematik' }) as never)
    const body = await res.json()
    expect(body.reviewQuestions).toEqual([])
  })

  describe('includeReview=true (FEATURES.FSRS_REVIEW=false — 7-gun fallback yolu)', () => {
    it('disc#1372 fix: answered_at kolonuyla sorgular ve sonuc doner (created_at DEGIL)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      mockRpc.mockResolvedValue({ data: [{ id: 'q1' }], error: null })

      // 1) yanlis-cevaplar sorgusu
      sessionAnswersMock.push({ data: [{ question_id: 'wq1' }], error: null })
      // 2) sonradan-dogru sorgusu (bos -> hala 'acik')
      sessionAnswersMock.push({ data: [], error: null })
      // 3) questions final-fetch
      questionsMock.push({ data: [{ id: 'wq1', game: 'matematik' }], error: null })

      const res = await GET(makeRequest({ game: 'matematik', includeReview: 'true' }) as never)
      const body = await res.json()
      expect(body.reviewQuestions).toEqual([{ id: 'wq1', game: 'matematik' }])
    })

    it('sonradan dogru cevaplanan soru review havuzundan cikar', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      mockRpc.mockResolvedValue({ data: [{ id: 'q1' }], error: null })

      sessionAnswersMock.push({ data: [{ question_id: 'wq1' }], error: null })
      // allAttempts DESCENDING doner (en yeni once); en-son deneme dogru -> duzeltilmis
      sessionAnswersMock.push({
        data: [
          { question_id: 'wq1', is_correct: true, is_skipped: false },
          { question_id: 'wq1', is_correct: false, is_skipped: false },
        ],
        error: null,
      })
      // questions sorgusuna hic gidilmemeli (reviewIds bos) -- push etmiyoruz

      const res = await GET(makeRequest({ game: 'matematik', includeReview: 'true' }) as never)
      const body = await res.json()
      expect(body.reviewQuestions).toEqual([])
    })

    it('disc#1371 fix: yanlistan ONCE gelen dogru cevap soruyu duzeltilmis saymamali (kronolojik)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      mockRpc.mockResolvedValue({ data: [{ id: 'q1' }], error: null })

      sessionAnswersMock.push({ data: [{ question_id: 'wq1' }], error: null })
      // allAttempts DESCENDING doner (en yeni once); en-son deneme yanlis -> review'da kalir
      sessionAnswersMock.push({
        data: [
          { question_id: 'wq1', is_correct: false, is_skipped: false },
          { question_id: 'wq1', is_correct: true, is_skipped: false },
        ],
        error: null,
      })
      questionsMock.push({ data: [{ id: 'wq1', game: 'matematik' }], error: null })

      const res = await GET(makeRequest({ game: 'matematik', includeReview: 'true' }) as never)
      const body = await res.json()
      expect(body.reviewQuestions).toEqual([{ id: 'wq1', game: 'matematik' }])
    })

    it('Codex P2 skip-handling: en-son SKIP onceki duzeltmeyi ezmemeli (duzeltilmis kalir)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
      mockRpc.mockResolvedValue({ data: [{ id: 'q1' }], error: null })

      sessionAnswersMock.push({ data: [{ question_id: 'wq1' }], error: null })
      // DESCENDING: en yeni = SKIP (atlanmali), ondan onceki gercek deneme = dogru (duzeltilmis).
      // Skip latest'e katilmaz -> son NON-SKIP dogru -> soru review'a GERI EKLENMEZ.
      sessionAnswersMock.push({
        data: [
          { question_id: 'wq1', is_correct: false, is_skipped: true },
          { question_id: 'wq1', is_correct: true, is_skipped: false },
          { question_id: 'wq1', is_correct: false, is_skipped: false },
        ],
        error: null,
      })
      // reviewIds bos beklenir -> questions sorgusuna gidilmez

      const res = await GET(makeRequest({ game: 'matematik', includeReview: 'true' }) as never)
      const body = await res.json()
      expect(body.reviewQuestions).toEqual([])
    })
  })
})

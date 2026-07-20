import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock ──────────────────────────────────

const mockGetUser = vi.fn()
const mockQuestionsIn = vi.fn()
const mockProfilesSingle = vi.fn()
const mockSessionCountGte = vi.fn()
const mockRpc = vi.fn()

// Chainable mock: every method returns the same object so chains work
function makeChain(terminal?: Record<string, ReturnType<typeof vi.fn>>) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {}
  const self = () => chain
  const methods = ['select', 'insert', 'update', 'eq', 'in', 'single', 'gte', 'from']
  for (const m of methods) {
    chain[m] = terminal?.[m] ?? vi.fn(self)
  }
  return chain
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'questions') {
    // from('questions').select(...).in(...) -> mockQuestionsIn
    const chain = makeChain({ in: mockQuestionsIn })
    return chain
  }
  if (table === 'game_sessions') {
    // gunluk-limit gate (COUNT): .select('id',{count}).eq(...).gte(...) -> mockSessionCountGte
    // Session insert/answers/coin/XP/topic-progress artik complete_game_session
    // RPC'sinde (migration 081) — bu chain'e dokunulmuyor.
    const chain = makeChain({ gte: mockSessionCountGte })
    return chain
  }
  if (table === 'profiles') {
    // daily-limit gate: .select('is_premium,premium_until').eq('id').single()
    const chain = makeChain({ single: mockProfilesSingle })
    return chain
  }
  // user_daily_quests, user_achievements — fire and forget (quest/badge best-effort)
  return makeChain()
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

// Rate limiter mock — testlerde her zaman izin ver
vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({
    check: vi.fn().mockResolvedValue({ success: true }),
  }),
}))

// Service role client mock — ayni chainable mock'u kullan
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}))

import { POST } from '../route'

// ─── Helpers ────────────────────────────────────────

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const Q1 = '10000000-0000-4000-8000-000000000001'
const Q2 = '10000000-0000-4000-8000-000000000002'
const REQ_ID = '20000000-0000-4000-8000-000000000001'

const validBody = {
  game: 'matematik',
  mode: 'classic',
  answers: [
    { questionId: Q1, selectedOption: 1, isCorrect: true, timeTaken: 5 },
    { questionId: Q2, selectedOption: 0, isCorrect: false, timeTaken: 12 },
  ],
  maxStreak: 1,
  timeLimit: 30,
  clientRequestId: REQ_ID,
}

// ─── Tests ──────────────────────────────────────────

describe('POST /api/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuestionsIn.mockResolvedValue({
      data: [
        { id: Q1, content: { answer: 1 }, difficulty: 2 },
        { id: Q2, content: { answer: 2 }, difficulty: 2 },
      ],
      error: null,
    })
    mockRpc.mockResolvedValue({
      data: { sessionId: 'session-1', totalXP: 0, correctCount: 0, wrongCount: 0, alreadyProcessed: false },
      error: null,
    })
    // Gate defaults: free (non-premium) kullanici, bugun 0 oturum -> gate gecer
    mockProfilesSingle.mockResolvedValue({ data: { is_premium: false, premium_until: null }, error: null })
    mockSessionCountGte.mockResolvedValue({ count: 0, error: null })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 400 if game is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ mode: 'classic', answers: [{ questionId: Q1, selectedOption: 0, isCorrect: true, timeTaken: 5 }] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if answers array is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ game: 'matematik', mode: 'classic', answers: [] }))
    expect(res.status).toBe(400)
  })

  it('returns 400 if questions not found in DB', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockQuestionsIn.mockResolvedValue({ data: [], error: null })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Sorular bulunamadi')
  })

  it('verifies correct answers server-side from DB', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })

    const res = await POST(makeRequest(validBody))
    const json = await res.json()

    // q1: selectedOption=1, answer=1 → correct
    // q2: selectedOption=0, answer=2 → wrong
    expect(json.correctCount).toBe(1)
    expect(json.wrongCount).toBe(1)
    expect(json.totalXP).toBeGreaterThan(0)
    expect(json.sessionId).toBe('session-1')
  })

  it('returns 500 if session insert fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(500)
  })

  it('returns 400 if clientRequestId eksik veya gecersiz UUID', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const { clientRequestId: _omit, ...bodyWithoutReqId } = validBody
    const res = await POST(makeRequest(bodyWithoutReqId))
    expect(res.status).toBe(400)
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('complete_game_session RPC p_client_request_id ile cagrilir (idempotency)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    await POST(makeRequest(validBody))
    expect(mockRpc).toHaveBeenCalledWith(
      'complete_game_session',
      expect.objectContaining({ p_user_id: 'u1', p_client_request_id: REQ_ID }),
    )
  })

  // ─── P0 regresyon-kilidi: ayni questionId tekrar gonderilerek coin/XP farming ──
  it('dedups repeated questionId — coin/XP farming korumasi', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    // Ayni dogru soruyu 5 kez gonder (cevabi bilinen tek soru amplifikasyonu)
    const farmBody = {
      game: 'matematik',
      mode: 'classic',
      timeLimit: 30,
      clientRequestId: REQ_ID,
      answers: Array.from({ length: 5 }, () => ({
        questionId: Q1, selectedOption: 1, isCorrect: true, timeTaken: 5,
      })),
    }
    const res = await POST(makeRequest(farmBody))
    const json = await res.json()
    // Dedup olmadan correctCount=5 (5 coin) olurdu; fix ile soru basi 1 -> 1
    expect(json.correctCount).toBe(1)
  })

  // ─── P1 regresyon-kilidi: gunluk limit POST'ta enforce edilir ──
  it('returns 403 when free user exceeds daily session limit', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSessionCountGte.mockResolvedValue({ count: 5, error: null }) // FREE_DAILY_LIMIT'e ulasti
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.code).toBe('daily_limit')
  })

  it('premium user bypasses daily limit', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfilesSingle.mockResolvedValue({ data: { is_premium: true, premium_until: null }, error: null })
    mockSessionCountGte.mockResolvedValue({ count: 999, error: null })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)
  })
})

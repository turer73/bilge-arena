import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock ──────────────────────────────────

const mockGetUser = vi.fn()
const mockQuestionsIn = vi.fn()
const mockProfilesSingle = vi.fn()
const mockProfileSelect = vi.fn()
const mockSessionCountGte = vi.fn()
const mockRpc = vi.fn()
const featureState = vi.hoisted(() => ({ QUIZ_LIMIT: false }))
const mockGetFirstAttempt = vi.hoisted(() => vi.fn())

vi.mock('@/lib/constants/premium', () => ({
  FEATURES: featureState,
  FREE_DAILY_LIMIT: 5,
}))
vi.mock('@/lib/questions/attempt-store', () => ({ getFirstQuestionAttempt: mockGetFirstAttempt }))

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
    chain.select = vi.fn((columns: string) => {
      mockProfileSelect(columns)
      return chain
    })
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
    // Mevcut session testleri daily-limit gate'i acik varsayar. Kapali rollout
    // yolu asagidaki ayri regresyon testiyle dogrulanir.
    featureState.QUIZ_LIMIT = true
    mockQuestionsIn.mockResolvedValue({
      data: [
        { id: Q1, content: { options: ['a', 'b', 'c', 'd'], answer: 1 }, difficulty: 2 },
        { id: Q2, content: { options: ['a', 'b', 'c', 'd'], answer: 2 }, difficulty: 2 },
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
    mockGetFirstAttempt.mockImplementation(async (_actor: string, questionId: string) => (
      questionId === Q1 ? 1 : questionId === Q2 ? 0 : null
    ))
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

  it('session payload ilk grade seçimini değiştiremez', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetFirstAttempt.mockResolvedValue(0)

    const res = await POST(makeRequest({
      game: 'matematik',
      mode: 'classic',
      answers: [{ questionId: Q1, selectedOption: 1, isCorrect: true, timeTaken: 5 }],
      timeLimit: 30,
      clientRequestId: REQ_ID,
    }))

    expect((await res.json()).totalXP).toBe(0)
    expect(mockRpc).toHaveBeenCalledWith('complete_game_session', expect.objectContaining({
      p_answers: [expect.objectContaining({ selected_option: 0, is_correct: false })],
    }))
  })

  it('grade edilmemiş doğrudan session cevabını skip sayar', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockGetFirstAttempt.mockResolvedValue(null)

    await POST(makeRequest({
      game: 'matematik',
      mode: 'classic',
      answers: [{ questionId: Q1, selectedOption: 1, isCorrect: true, timeTaken: 5 }],
      timeLimit: 30,
      clientRequestId: REQ_ID,
    }))

    expect(mockRpc).toHaveBeenCalledWith('complete_game_session', expect.objectContaining({
      p_answers: [expect.objectContaining({ selected_option: null, is_skipped: true, is_correct: false })],
    }))
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

  it('deneme gerçek soru süresini korur ve süre bonusu üretmez', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({
      game: 'matematik',
      mode: 'deneme',
      timeLimit: 30,
      clientRequestId: REQ_ID,
      answers: [{ questionId: Q1, selectedOption: 1, isCorrect: true, timeTaken: 47.2 }],
    }))

    expect(res.status).toBe(200)
    expect((await res.json()).totalXP).toBe(20)
    expect(mockRpc).toHaveBeenCalledWith('complete_game_session', expect.objectContaining({
      p_total_xp: 20,
      p_time_spent_sec: 47,
      p_answers: [expect.objectContaining({ time_taken_sec: 47.2, is_fast: false })],
    }))
  })

  it('istemci timeLimit ve timeTaken ile süre bonusu üretemez', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({
      game: 'matematik',
      mode: 'classic',
      timeLimit: 120,
      clientRequestId: REQ_ID,
      answers: [{ questionId: Q1, selectedOption: 1, isCorrect: true, timeTaken: 0 }],
    }))

    expect(res.status).toBe(200)
    expect((await res.json()).totalXP).toBe(20)
  })

  // ─── Regresyon-kilidi (Vercel Agent Review, PR#271): idempotent replay quest/badge'i
  // TEKRAR calistirmamali — RPC odul-uretmedi (alreadyProcessed=true), quest current_value
  // ikinci kez artmamali ──
  it('alreadyProcessed=true iken quest/badge adimlarini atlar', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: { sessionId: 'session-1', totalXP: 15, correctCount: 1, wrongCount: 1, alreadyProcessed: true },
      error: null,
    })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)

    const queriedTables = mockFrom.mock.calls.map(([table]) => table)
    expect(queriedTables).not.toContain('user_daily_quests')
    expect(queriedTables).not.toContain('user_achievements')
  })

  it('alreadyProcessed=false iken quest/badge adimlari normal calisir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockRpc.mockResolvedValue({
      data: { sessionId: 'session-1', totalXP: 15, correctCount: 1, wrongCount: 1, alreadyProcessed: false },
      error: null,
    })

    await POST(makeRequest(validBody))

    const queriedTables = mockFrom.mock.calls.map(([table]) => table)
    expect(queriedTables).toContain('user_daily_quests')
    expect(queriedTables).toContain('user_achievements')
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
  it('newly earned session badges use the atomic award_badges RPC contract', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfilesSingle
      .mockResolvedValueOnce({ data: { is_premium: false, premium_until: null }, error: null })
      .mockResolvedValueOnce({ data: { total_xp: 0, total_sessions: 1, correct_answers: 1, longest_streak: 1 }, error: null })
    mockRpc
      .mockResolvedValueOnce({
        data: { sessionId: 'session-1', totalXP: 15, correctCount: 1, wrongCount: 1, alreadyProcessed: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ awarded_codes: ['first_game', 'first_correct'], total_xp_earned: 75 }],
        error: null,
      })

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenLastCalledWith('award_badges', {
      p_user_id: 'u1',
      p_badge_codes: ['first_game', 'first_correct'],
    })
    expect((await res.json()).newBadges).toEqual(['first_game', 'first_correct'])
  })

  it('passes login streak stats to the badge RPC after a solo session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfilesSingle
      .mockResolvedValueOnce({ data: { is_premium: false, premium_until: null }, error: null })
      .mockResolvedValueOnce({
        data: {
          total_xp: 0,
          total_sessions: 0,
          correct_answers: 0,
          longest_streak: 0,
          current_streak: 7,
          multiplayer_wins: 0,
          rooms_completed: 0,
          multiplayer_firsts: 0,
        },
        error: null,
      })
    mockRpc
      .mockResolvedValueOnce({
        data: { sessionId: 'session-1', totalXP: 15, correctCount: 1, wrongCount: 1, alreadyProcessed: false },
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ awarded_codes: ['login_7'], total_xp_earned: 150 }],
        error: null,
      })

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenLastCalledWith('award_badges', {
      p_user_id: 'u1',
      p_badge_codes: ['login_7'],
    })
    const badgeProfileSelect = mockProfileSelect.mock.calls
      .map(([columns]) => String(columns))
      .find((columns) => columns.includes('total_xp'))
    expect(badgeProfileSelect).toContain('current_streak')
    expect(badgeProfileSelect).toContain('multiplayer_wins')
    expect(badgeProfileSelect).toContain('rooms_completed')
    expect(badgeProfileSelect).toContain('multiplayer_firsts')
    expect((await res.json()).newBadges).toEqual(['login_7'])
  })

  it('returns 403 when free user exceeds daily session limit', async () => {
    featureState.QUIZ_LIMIT = true
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSessionCountGte.mockResolvedValue({ count: 5, error: null }) // FREE_DAILY_LIMIT'e ulasti
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(403)
    const json = await res.json()
    expect(json.code).toBe('daily_limit')
  })

  it('premium user bypasses daily limit', async () => {
    featureState.QUIZ_LIMIT = true
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockProfilesSingle.mockResolvedValue({ data: { is_premium: true, premium_until: null }, error: null })
    mockSessionCountGte.mockResolvedValue({ count: 999, error: null })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(200)
  })

  it('feature kapaliyken free user icin daily limit gate uygulanmaz', async () => {
    featureState.QUIZ_LIMIT = false
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    mockSessionCountGte.mockResolvedValue({ count: 999, error: null })

    const res = await POST(makeRequest(validBody))

    expect(res.status).toBe(200)
    expect(mockSessionCountGte).not.toHaveBeenCalled()
  })
})

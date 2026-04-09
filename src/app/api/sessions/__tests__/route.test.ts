import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase mock ──────────────────────────────────

const mockGetUser = vi.fn()
const mockQuestionsIn = vi.fn()
const mockSessionInsertSelectSingle = vi.fn()

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
    // INSERT path: from('game_sessions').insert(...).select(...).single()
    // UPDATE path: from('game_sessions').update(...).eq(...)
    const chain = makeChain({ single: mockSessionInsertSelectSingle })
    return chain
  }
  // session_answers, xp_log — fire and forget
  return makeChain()
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  })),
}))

// Service role client mock — ayni chainable mock'u kullan
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: mockFrom,
    rpc: vi.fn().mockResolvedValue({ error: null }),
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

const validBody = {
  game: 'matematik',
  mode: 'classic',
  answers: [
    { questionId: 'q1', selectedOption: 1, isCorrect: true, timeTaken: 5 },
    { questionId: 'q2', selectedOption: 0, isCorrect: false, timeTaken: 12 },
  ],
  maxStreak: 1,
  timeLimit: 30,
}

// ─── Tests ──────────────────────────────────────────

describe('POST /api/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQuestionsIn.mockResolvedValue({
      data: [
        { id: 'q1', content: { answer: 1 }, difficulty: 2 },
        { id: 'q2', content: { answer: 2 }, difficulty: 2 },
      ],
      error: null,
    })
    mockSessionInsertSelectSingle.mockResolvedValue({ data: { id: 'session-1' }, error: null })
  })

  it('returns 401 if not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 400 if game is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
    const res = await POST(makeRequest({ mode: 'classic', answers: [{ questionId: 'q1', selectedOption: 0, isCorrect: true, timeTaken: 5 }] }))
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
    mockSessionInsertSelectSingle.mockResolvedValue({ data: null, error: { message: 'DB error' } })

    const res = await POST(makeRequest(validBody))
    expect(res.status).toBe(500)
  })
})

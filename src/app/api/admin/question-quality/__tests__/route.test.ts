import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

// ─── Mock setup ──────────────────────────────────

const { mockCheckPermission, mockGte, mockQuestions, mockReports } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockGte: vi.fn(),
  mockQuestions: vi.fn(),
  mockReports: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

// Service-role: questions (select.gte.order.limit) + error_reports (select.eq).
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      if (table === 'questions') {
        const chain: Record<string, unknown> = {}
        chain.select = vi.fn(() => chain)
        chain.gte = vi.fn((col: string, val: number) => { mockGte(col, val); return chain })
        chain.order = vi.fn(() => chain)
        chain.limit = vi.fn(async () => mockQuestions())
        return chain
      }
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.eq = vi.fn(async () => mockReports())
      return chain
    }),
  })),
}))

import { GET } from '../route'

// ─── Helpers ─────────────────────────────────────

const ADMIN = { id: 'admin-1' }

function makeRequest(query = '') {
  return new Request(`http://localhost/api/admin/question-quality${query}`) as unknown as NextRequest
}

function q(id: string, answered: number, correct: number) {
  return {
    id, game: 'matematik', category: 'cebir', subcategory: null, difficulty: 2,
    is_active: true, content: { question: `Soru ${id}` },
    times_answered: answered, times_correct: correct,
  }
}

describe('GET /api/admin/question-quality', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckPermission.mockResolvedValue(ADMIN)
    mockQuestions.mockReturnValue({ data: [], error: null })
    mockReports.mockReturnValue({ data: [], error: null })
  })

  it('returns 403 without admin.questions.view permission', async () => {
    mockCheckPermission.mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(403)
    expect(mockCheckPermission).toHaveBeenCalledWith(expect.anything(), 'admin.questions.view')
  })

  it('keeps low-success OR reported questions, drops healthy ones, sorts by rate asc', async () => {
    mockQuestions.mockReturnValue({
      data: [q('a', 100, 30), q('b', 100, 70), q('c', 100, 80)], // 30% / 70% / 80%
      error: null,
    })
    mockReports.mockReturnValue({ data: [{ question_id: 'c' }], error: null }) // c raporlu

    const res = await GET(makeRequest()) // default minAnswered=20, maxRate=50
    expect(res.status).toBe(200)
    const json = await res.json()
    // b (70%, raporsuz) elenir; a (30%<50) ve c (80% ama 1 rapor) kalir; rate asc -> a, c
    expect(json.questions.map((x: { id: string }) => x.id)).toEqual(['a', 'c'])
    expect(json.questions[0].success_rate).toBe(30)
    expect(json.questions[1].pending_reports).toBe(1)
  })

  it('passes the clamped minAnswered to the questions query', async () => {
    await GET(makeRequest('?minAnswered=50'))
    expect(mockGte).toHaveBeenCalledWith('times_answered', 50)
  })

  it('clamps a negative minAnswered to the floor (1)', async () => {
    await GET(makeRequest('?minAnswered=-5'))
    expect(mockGte).toHaveBeenCalledWith('times_answered', 1)
  })

  it('falls back to default (20) for a non-numeric minAnswered', async () => {
    await GET(makeRequest('?minAnswered=abc'))
    expect(mockGte).toHaveBeenCalledWith('times_answered', 20)
  })

  it('sets capped=true when the candidate pool hits the 500 cap', async () => {
    const many = Array.from({ length: 500 }, (_, i) => q(`q${i}`, 100, 10)) // hepsi %10
    mockQuestions.mockReturnValue({ data: many, error: null })
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(json.capped).toBe(true)
    expect(json.questions.length).toBe(50) // limit
  })

  it('returns GENERIC 500 (no PG leak) when the questions query errors', async () => {
    mockQuestions.mockReturnValue({ data: null, error: { message: 'permission denied for table questions' } })
    const res = await GET(makeRequest())
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(JSON.stringify(json)).not.toContain('permission denied')
  })
})

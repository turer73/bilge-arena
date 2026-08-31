import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionRow } from '@/lib/utils/question-public'

const { mockRpc } = vi.hoisted(() => ({ mockRpc: vi.fn() }))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ rpc: mockRpc })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({
    check: vi.fn(async () => ({ success: true })),
  })),
}))

vi.mock('@/lib/questions/guest-grading-session', () => ({
  createGuestGradingToken: vi.fn(() => 'signed-guest-token'),
  GUEST_GRADING_COOKIE: 'ba_guest_grading',
  GUEST_GRADING_TTL_SECONDS: 7200,
}))

import { GET } from '../route'

const oldActivationFlag = process.env.ACTIVATION_EXPERIMENT_ENABLED

function makeQuestionRow(id: string, overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id,
    external_id: null,
    game: 'fen',
    category: 'biyoloji',
    subcategory: null,
    topic: 'Hücre',
    difficulty: 2,
    level_tag: null,
    content: { question: `Soru ${id}`, options: ['A', 'B', 'C', 'D'], answer: 1 },
    base_points: 20,
    is_active: true,
    is_boss: false,
    times_answered: 0,
    times_correct: 0,
    source: 'fixture',
    exam_ref: 'TYT',
    published_revision_id: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

function makeRequest(params: Record<string, string>) {
  const url = new URL('http://localhost/api/questions/preview')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return new Request(url, { headers: { 'x-forwarded-for': '1.2.3.4' } })
}

describe('GET /api/questions/preview exam scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ACTIVATION_EXPERIMENT_ENABLED = 'true'
  })

  afterAll(() => {
    if (oldActivationFlag === undefined) delete process.env.ACTIVATION_EXPERIMENT_ENABLED
    else process.env.ACTIVATION_EXPERIMENT_ENABLED = oldActivationFlag
  })

  it('rejects an AYT literature category inside exact TYT Turkish scope', async () => {
    const response = await GET(makeRequest({
      game: 'turkce', category: 'edebiyat', examRef: 'TYT',
    }) as never)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Kategori sinav kapsamiyla uyumsuz' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects an unknown category instead of dropping the database filter', async () => {
    const response = await GET(makeRequest({ game: 'sosyal', category: 'bilinmeyen', examRef: 'TYT' }) as never)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Gecerli kategori belirtilmedi' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('rejects Social without an exact exam scope before database work', async () => {
    const response = await GET(makeRequest({ game: 'sosyal' }) as never)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: 'Sosyal icin exact sinav kapsami belirtilmelidir',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each(['tyt', 'UNKNOWN', ''])('rejects an invalid explicit exam scope: %s', async (examRef) => {
    const response = await GET(makeRequest({ game: 'fen', examRef }) as never)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Gecerli sinav kapsami belirtilmedi' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it.each(['0', '6', '2.5', '2foo', ''])('rejects an invalid explicit difficulty: %s', async (difficulty) => {
    const response = await GET(makeRequest({ game: 'fen', difficulty }) as never)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'Gecerli zorluk belirtilmedi' })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('keeps guest TYT Social preview closed until a common-role projection exists', async () => {
    const response = await GET(makeRequest({ game: 'sosyal', category: 'din', examRef: 'TYT' }) as never)

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      error: 'TYT Sosyal misafir onizlemesi hazirlaniyor',
    })
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('preserves TYT and biyoloji while relaxing only difficulty', async () => {
    mockRpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [makeQuestionRow('tyt-bio')], error: null })

    const response = await GET(makeRequest({
      game: 'fen',
      category: 'biyoloji',
      difficulty: '5',
      examRef: 'TYT',
    }) as never)

    expect(mockRpc).toHaveBeenNthCalledWith(1, 'select_random_questions', {
      p_game: 'fen',
      p_limit: 3,
      p_category: 'biyoloji',
      p_difficulty: 5,
      p_exam_ref: 'TYT',
    })
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'select_random_questions', {
      p_game: 'fen',
      p_limit: 3,
      p_category: 'biyoloji',
      p_exam_ref: 'TYT',
    })
    await expect(response.json()).resolves.toEqual({
      question: expect.objectContaining({ id: 'tyt-bio', category: 'biyoloji' }),
      questions: [expect.objectContaining({ id: 'tyt-bio', category: 'biyoloji' })],
    })
  })

  it('does not retry without scope when exact TYT biyoloji pool is empty', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null })

    const response = await GET(makeRequest({
      game: 'fen',
      category: 'biyoloji',
      examRef: 'TYT',
    }) as never)

    expect(mockRpc).toHaveBeenCalledTimes(1)
    await expect(response.json()).resolves.toEqual({ question: null, questions: [] })
  })

  it('fails closed if the RPC returns an AYT row for a TYT request', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [makeQuestionRow('ayt-bio', { exam_ref: 'AYT-SAY', topic: 'İnsan Fizyolojisi' })],
      error: null,
    })

    const response = await GET(makeRequest({
      game: 'fen',
      category: 'biyoloji',
      examRef: 'TYT',
    }) as never)

    await expect(response.json()).resolves.toEqual({ question: null, questions: [] })
  })

  it('returns at most three public questions without answer fields', async () => {
    mockRpc.mockResolvedValueOnce({
      data: Array.from({ length: 4 }, (_, index) => makeQuestionRow(`q-${index}`)),
      error: null,
    })

    const response = await GET(makeRequest({ game: 'fen', examRef: 'TYT' }) as never)
    const payload = await response.json()

    expect(payload.questions).toHaveLength(3)
    expect(payload.question.id).toBe('q-0')
    for (const question of payload.questions) {
      expect(question.content).not.toHaveProperty('answer')
      expect(question.content).not.toHaveProperty('solution')
      expect(question.content).not.toHaveProperty('explanation')
    }
  })

  it('activation preview binds the issued question set to an HttpOnly reward ticket', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [1, 2, 3].map((index) =>
        makeQuestionRow(`10000000-0000-4000-8000-00000000000${index}`)
      ),
      error: null,
    })

    const response = await GET(makeRequest({
      game: 'fen',
      examRef: 'TYT',
      activation: '1',
    }) as never)
    const setCookie = response.headers.get('set-cookie')

    expect(response.status).toBe(200)
    expect(setCookie).toContain('ba_activation_reward=')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=lax')
    expect(setCookie).toContain('Max-Age=7200')
  })

  it('normal guest preview issues a separate HttpOnly grading session', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [makeQuestionRow('10000000-0000-4000-8000-000000000001')],
      error: null,
    })

    const response = await GET(makeRequest({ game: 'fen', examRef: 'TYT' }) as never)
    const setCookie = response.headers.get('set-cookie')

    expect(response.status).toBe(200)
    expect(setCookie).toContain('ba_guest_grading=signed-guest-token')
    expect(setCookie).toContain('HttpOnly')
    expect(setCookie).toContain('SameSite=lax')
    expect(setCookie).toContain('Max-Age=7200')
    expect(setCookie).not.toContain('ba_activation_reward=')
  })

  it('fails closed before the database when the activation kill switch is off', async () => {
    process.env.ACTIVATION_EXPERIMENT_ENABLED = 'false'

    const response = await GET(makeRequest({ game: 'fen', activation: '1' }) as never)

    expect(response.status).toBe(404)
    expect(mockRpc).not.toHaveBeenCalled()
  })
})

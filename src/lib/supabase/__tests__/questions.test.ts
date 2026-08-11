import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Question } from '@/types/database'

vi.mock('@/lib/utils/question-cache', () => ({
  cacheQuestions: vi.fn(async () => {}),
  getCachedQuestions: vi.fn(async () => [] as Question[]),
}))

import { fetchPreviewQuestion, fetchPreviewQuestions, fetchQuizQuestions } from '../questions'

function makeQuestion(id: string, game = 'matematik'): Question {
  return {
    id,
    game,
    category: 'sayilar',
    subcategory: null,
    difficulty: 1,
    is_active: true,
    exam_ref: 'TYT',
    content: {
      soru: 'Test',
      secenekler: ['A', 'B', 'C', 'D'],
      dogru: 0,
      aciklama: '',
    },
  } as unknown as Question
}

describe('fetchQuizQuestions — Madde 9 #6 API proxy', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  let lastUrl = ''

  beforeEach(() => {
    lastUrl = ''
    fetchMock = vi.fn(async (url: string) => {
      lastUrl = url
      return new Response(
        JSON.stringify({
          questions: Array.from({ length: 20 }, (_, i) => makeQuestion(`q-${i}`)),
          reviewQuestions: [],
          attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { onLine: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('GET /api/questions/random cagrilir', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(lastUrl).toContain('/api/questions/random')
    expect(lastUrl).toContain('game=matematik')
    expect(lastUrl).toContain('limit=10')
    expect(lastUrl).toContain('mode=classic')
  })

  it('mode query parametre olarak gecer', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10, mode: 'deneme' })
    expect(lastUrl).toContain('mode=deneme')
  })

  it('category query parametre olarak gecer', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10, category: 'cebir' })
    expect(lastUrl).toContain('category=cebir')
  })

  it('difficulty query parametre olarak gecer', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10, difficulty: 3 })
    expect(lastUrl).toContain('difficulty=3')
  })

  it('examRef query parametre olarak gecer', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10, examRef: 'LGS' })
    expect(lastUrl).toContain('examRef=LGS')
  })

  it('includeReview true varsayilan', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(lastUrl).toContain('includeReview=true')
  })

  it('includeReview false ise param eklenmez', async () => {
    await fetchQuizQuestions({ game: 'matematik', limit: 10, includeReview: false })
    expect(lastUrl).not.toContain('includeReview')
  })

  it('excludeIds gecerli UUID listesi gecer', async () => {
    const validId = '12345678-1234-1234-1234-123456789012'
    await fetchQuizQuestions({
      game: 'matematik',
      limit: 10,
      excludeIds: [validId, 'invalid-id'],
    })
    expect(lastUrl).toContain(`excludeIds=${encodeURIComponent(validId)}`)
    expect(lastUrl).not.toContain('invalid-id')
  })

  it('cevrimdisi mode fetch cagrilmaz', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    fetchMock.mockClear()
    const result = await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({ questions: [], attemptId: null, expiresAt: null })
  })

  it('API hata donerse offline cache fallback denenir', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'fail' }), { status: 500 }),
    )
    const result = await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(result).toEqual({ questions: [], attemptId: null, expiresAt: null })
  })

  it('401 (anon) icin cache fallback', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Yetkisiz' }), { status: 401 }),
    )
    const result = await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(result).toEqual({ questions: [], attemptId: null, expiresAt: null })
  })

  it('API sonucu Question dizisi olarak dondurulur', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          questions: [makeQuestion('q-a'), makeQuestion('q-b')],
          reviewQuestions: [],
          attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
        { status: 200 },
      ),
    )
    const result = await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    expect(result.questions).toHaveLength(2)
    expect(result.questions[0].id).toMatch(/^q-/)
    expect(result.attemptId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  })

  it('reviewQuestions varsa %30 oranla karistirilir', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          questions: Array.from({ length: 10 }, (_, i) => makeQuestion(`new-${i}`)),
          reviewQuestions: Array.from({ length: 5 }, (_, i) => makeQuestion(`review-${i}`)),
          attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          expiresAt: '2099-01-01T00:00:00.000Z',
        }),
        { status: 200 },
      ),
    )
    const result = await fetchQuizQuestions({ game: 'matematik', limit: 10 })
    const reviewCount = result.questions.filter(q => q.id.startsWith('review-')).length
    expect(reviewCount).toBeGreaterThan(0)
    expect(reviewCount).toBeLessThanOrEqual(4)
  })

  it('misafir mikro turu en fazla 3 public soru alir', async () => {
    const result = await fetchPreviewQuestions('turkce', { examRef: 'LGS' })

    expect(lastUrl).toContain('/api/questions/preview')
    expect(lastUrl).toContain('game=turkce')
    expect(lastUrl).toContain('examRef=LGS')
    expect(result).toHaveLength(3)
  })

  it('eski tek-soru preview yanitiyla geriye uyumludur', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ question: makeQuestion('legacy') }), { status: 200 }),
    )

    await expect(fetchPreviewQuestions('turkce')).resolves.toEqual([
      expect.objectContaining({ id: 'legacy' }),
    ])
    await expect(fetchPreviewQuestion('turkce')).resolves.toEqual(
      expect.objectContaining({ id: 'q-0' }),
    )
  })

  it.each([
    { attemptId: null, expiresAt: '2099-01-01T00:00:00.000Z' },
    { attemptId: 'not-a-uuid', expiresAt: '2099-01-01T00:00:00.000Z' },
    { attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expiresAt: 'invalid-date' },
    { attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expiresAt: '2020-01-01T00:00:00.000Z' },
  ])('gecersiz veya eksik bileti fail-closed reddeder: %o', async (ticket) => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          questions: [makeQuestion('q-a')],
          reviewQuestions: [],
          ...ticket,
        }),
        { status: 200 },
      ),
    )

    await expect(fetchQuizQuestions({ game: 'matematik' })).resolves.toEqual({
      questions: [],
      attemptId: null,
      expiresAt: null,
    })
  })
})

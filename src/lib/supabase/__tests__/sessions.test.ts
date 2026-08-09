import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'

// Import AFTER mock setup below
import type { AnswerRecord } from '@/stores/quiz-store'

// ─── fetch mock ─────────────────────────────────────
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Import AFTER global mock
import { saveGameSession } from '../sessions'

// ─── Test verileri ─────────────────────────────────────

const baseParams = {
  userId: 'user-1',
  attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  game: 'matematik' as const,
  mode: 'classic',
  answers: [
    { questionId: 'q1', selectedOption: 1, isCorrect: true, timeTaken: 5, xpEarned: 15 },
    { questionId: 'q2', selectedOption: 0, isCorrect: false, timeTaken: 12, xpEarned: 0 },
    { questionId: 'q3', selectedOption: 2, isCorrect: true, timeTaken: 8, xpEarned: 18 },
  ] as AnswerRecord[],
  totalXP: 33,
  maxStreak: 1,
  clientRequestId: '00000000-0000-4000-8000-000000000001',
}

function mockFetchSuccess(sessionId = 'session-123', newBadges: string[] = []) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      sessionId,
      totalXP: 33,
      correctCount: 2,
      wrongCount: 1,
      maxStreak: 1,
      newBadges,
    }),
  })
}

function mockFetchError(status = 500) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ error: 'Server error' }),
  })
}

describe('saveGameSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('session ID ve atomik olarak kazanilan rozet kodlarini dondurmeli', async () => {
    mockFetchSuccess('session-123', ['first_game'])
    const result = await saveGameSession(baseParams)
    expect(result).toEqual({
      sessionId: 'session-123',
      totalXP: 33,
      correctCount: 2,
      wrongCount: 1,
      newBadges: ['first_game'],
    })
  })

  it('/api/sessions endpointine POST yapmali', async () => {
    mockFetchSuccess()
    await saveGameSession(baseParams)

    expect(mockFetch).toHaveBeenCalledOnce()
    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/sessions')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
  })

  it('body icinde dogru verileri gondermeli', async () => {
    mockFetchSuccess()
    await saveGameSession(baseParams)

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.game).toBe('matematik')
    expect(body.attemptId).toBe(baseParams.attemptId)
    expect(body.mode).toBe('classic')
    expect(body.maxStreak).toBe(1)
    expect(body.answers).toHaveLength(3)
    expect(body.answers[0].questionId).toBe('q1')
    expect(body.answers[0].selectedOption).toBe(1)
    expect(body.answers[0].isCorrect).toBe(true)
    expect(body.answers[0].timeTaken).toBe(5)
    expect(body.clientRequestId).toBe(baseParams.clientRequestId)
  })

  it('xpEarned gonderilmemeli (server hesaplar)', async () => {
    mockFetchSuccess()
    await saveGameSession(baseParams)

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    // Client-side XP degerlerini gondermemeli
    expect(body.answers[0]).not.toHaveProperty('xpEarned')
  })

  it('selectedCanonical varsa selectedOption olarak ONU gondermeli (disc#1296)', async () => {
    mockFetchSuccess()
    await saveGameSession({
      ...baseParams,
      answers: [
        // Kullanici ekranda 3. siradaki sikki secti; kanonik DB-index'i 1.
        { questionId: 'q1', selectedOption: 3, selectedCanonical: 1, isCorrect: true, timeTaken: 5, xpEarned: 15 },
      ] as AnswerRecord[],
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    // Server kanonik index'le notlar — ekran-index'i (3) DEGIL kanonik (1) gitmeli.
    expect(body.answers[0].selectedOption).toBe(1)
  })

  it('API hata donerse null dondurmeli', async () => {
    mockFetchError(500)
    const result = await saveGameSession(baseParams)
    expect(result).toBeNull()
  })

  it('fetch reject olursa null dondurmeli', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    const result = await saveGameSession(baseParams)
    expect(result).toBeNull()
  })

  it('bos cevap dizisi gondermeli', async () => {
    mockFetchSuccess()
    await saveGameSession({
      ...baseParams,
      answers: [],
      totalXP: 0,
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.answers).toHaveLength(0)
  })

  it('filter parametrelerini gecirmeli', async () => {
    mockFetchSuccess()
    await saveGameSession({
      ...baseParams,
      category: 'geometri',
      difficulty: 3,
    })

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.category).toBe('geometri')
    expect(body.difficulty).toBe(3)
  })

  it('timeLimit parametresini gecirmeli (default 30)', async () => {
    mockFetchSuccess()
    await saveGameSession(baseParams)

    const [, options] = mockFetch.mock.calls[0]
    const body = JSON.parse(options.body)
    expect(body.timeLimit).toBe(30)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * /api/admin/generate-questions kontrat testleri
 * --------------------------------------------------------------
 * 2026-04-26: Bu route uretim DB'sine soru ekliyordu ama HIC TEST'I YOKTU.
 * Tier B kapsami:
 *   1. POST body'sindeki level_tag DB insert'ine gerekiyor (regresyon).
 *   2. Wordquest icin level_tag default 'B2' olmali (legacy seed davranisi).
 *   3. Wordquest disinda level_tag NULL kalir (matematik/turkce/fen/sosyal'da level kullanilmiyor).
 *   4. Gecersiz level_tag (ornegin 'D1') 400 ile reddedilmeli.
 *   5. PUT (manuel) endpoint'i de level_tag desteklemeli.
 */

// ── Hoisted mock fns ─────────────────────────────────
const { mockCheckPermission, mockInsertCapture } = vi.hoisted(() => ({
  mockCheckPermission: vi.fn(),
  mockInsertCapture: vi.fn(),
}))

// ── supabase chain helper ───────────────────────────
// Zincirlemenin hicbir yerine duraksamamak icin tum metotlar kendi cebini geri verir
// ve `.then` ile awaitable. Boylece .select().eq().eq().limit() veya .select().eq().limit().eq()
// hepsi ayni mocku surer.
function makeAwaitableChain(result: { data: unknown[]; error?: null }) {
  const chain: Record<string, unknown> = {}
  const passthrough = () => chain
  for (const m of ['select', 'eq', 'not', 'limit', 'order']) chain[m] = passthrough
  chain.then = (resolve: (v: unknown) => void) => resolve(result)
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => makeAwaitableChain({ data: [], error: null })),
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn(() => ({
      insert: (payload: unknown) => {
        mockInsertCapture(payload)
        return {
          select: vi.fn(() => Promise.resolve({ data: [{ id: 'new-1' }], error: null })),
        }
      },
    })),
  })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  checkPermission: mockCheckPermission,
}))

// ── Gemini fetch mock helper ────────────────────────
// fetchCalls: AI'ya gonderilen request body'lerini yakalar (sistem prompt
// dogrulamasi icin).
const fetchCalls: Array<{ url: string; body: unknown }> = []

function mockGeminiResponse(questions: unknown[]) {
  fetchCalls.length = 0
  global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : null
    fetchCalls.push({ url: String(url), body })
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: JSON.stringify(questions) }] } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }) as unknown as typeof fetch
}

const VALID_AI_QUESTION = {
  question: 'Which word means very happy? Pick the correct synonym.',
  options: ['sad', 'elated', 'angry', 'tired', 'bored'],
  answer: 1,
  solution: 'elated = cok mutlu (synonym)',
  topic: 'Synonyms',
}

function makePostBody(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/generate-questions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makePutBody(body: Record<string, unknown>) {
  return new Request('http://localhost/api/admin/generate-questions', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/generate-questions — level_tag passthrough', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    mockGeminiResponse([VALID_AI_QUESTION])
  })

  afterEach(() => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  })

  it('wordquest: explicit level_tag (A2) DB insert payload\'ina yansir', async () => {
    const { POST } = await import('../route')
    const res = await POST(makePostBody({
      game: 'wordquest',
      category: 'vocabulary',
      difficulty: 2,
      level_tag: 'A2',
      count: 1,
    }))

    expect(res.status).toBe(200)
    expect(mockInsertCapture).toHaveBeenCalledOnce()
    const payload = mockInsertCapture.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(payload).toHaveLength(1)
    expect(payload[0].level_tag).toBe('A2')
  })

  it('wordquest: level_tag verilmediginde default B2 atanir (legacy seed davranisi)', async () => {
    const { POST } = await import('../route')
    const res = await POST(makePostBody({
      game: 'wordquest',
      category: 'grammar',
      difficulty: 3,
      count: 1,
    }))

    expect(res.status).toBe(200)
    const payload = mockInsertCapture.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(payload[0].level_tag).toBe('B2')
  })

  it('matematik: level_tag yoksa NULL kalir (TYT oyunlarinda level alaninin anlami yok)', async () => {
    const { POST } = await import('../route')
    const res = await POST(makePostBody({
      game: 'matematik',
      category: 'sayilar',
      difficulty: 3,
      count: 1,
    }))

    expect(res.status).toBe(200)
    const payload = mockInsertCapture.mock.calls[0][0] as Array<Record<string, unknown>>
    expect(payload[0].level_tag).toBeNull()
  })

  it('gecersiz level_tag (D1) 400 doner — sema check', async () => {
    const { POST } = await import('../route')
    const res = await POST(makePostBody({
      game: 'wordquest',
      category: 'vocabulary',
      difficulty: 2,
      level_tag: 'D1',
      count: 1,
    }))

    expect(res.status).toBe(400)
    // Insert hic cagrilmamali
    expect(mockInsertCapture).not.toHaveBeenCalled()
  })

  it('wordquest A1: AI prompt CEFR seviye bilgisini icerir', async () => {
    const { POST } = await import('../route')
    const res = await POST(makePostBody({
      game: 'wordquest',
      category: 'vocabulary',
      difficulty: 1,
      level_tag: 'A1',
      count: 1,
    }))

    expect(res.status).toBe(200)
    expect(fetchCalls).toHaveLength(1)
    // Gemini API request body: { system_instruction: { parts: [{ text: ... }] }, contents: [...] }
    const sentBody = fetchCalls[0].body as {
      system_instruction?: { parts?: Array<{ text?: string }> }
      contents?: Array<{ parts?: Array<{ text?: string }> }>
    }
    const systemText = sentBody.system_instruction?.parts?.[0]?.text ?? ''
    const userText = sentBody.contents?.[0]?.parts?.[0]?.text ?? ''
    const fullPrompt = `${systemText}\n${userText}`
    // 'A1' veya 'Beginner' kelimesi prompt'ta gecmeli ki AI level'a gore kelime/grammar secsin.
    expect(fullPrompt).toMatch(/A1|Beginner/i)
  })

  it('tum 6 CEFR seviyesi (A1-C2) gecerli', async () => {
    const { POST } = await import('../route')
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
    for (const lvl of levels) {
      mockInsertCapture.mockClear()
      mockGeminiResponse([VALID_AI_QUESTION])
      const res = await POST(makePostBody({
        game: 'wordquest',
        category: 'vocabulary',
        difficulty: 2,
        level_tag: lvl,
        count: 1,
      }))
      expect(res.status, `${lvl} 200 donmeli`).toBe(200)
      const payload = mockInsertCapture.mock.calls[0][0] as Array<Record<string, unknown>>
      expect(payload[0].level_tag, `${lvl} payload'a yansimali`).toBe(lvl)
    }
  })
})

describe('PUT /api/admin/generate-questions — manuel level_tag', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
    // PUT manuel insert .select().single() doner — tek satir
    vi.doMock('@/lib/supabase/service-role', () => ({
      createServiceRoleClient: vi.fn(() => ({
        from: vi.fn(() => ({
          insert: (payload: unknown) => {
            mockInsertCapture(payload)
            return {
              select: vi.fn(() => ({
                single: vi.fn(() => Promise.resolve({ data: { id: 'manual-1' }, error: null })),
              })),
            }
          },
        })),
      })),
    }))
  })

  it('wordquest manuel ekleme: level_tag DB payload\'ina yansir', async () => {
    vi.resetModules()
    const { PUT } = await import('../route')
    const res = await PUT(makePutBody({
      game: 'wordquest',
      category: 'vocabulary',
      difficulty: 2,
      level_tag: 'B1',
      question: 'What is the synonym of happy?',
      options: ['sad', 'glad', 'tired', 'bored', 'angry'],
      answer: 1,
      solution: 'glad = mutlu',
    }))

    expect(res.status).toBe(200)
    expect(mockInsertCapture).toHaveBeenCalledOnce()
    const payload = mockInsertCapture.mock.calls[0][0] as Record<string, unknown>
    expect(payload.level_tag).toBe('B1')
  })
})

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

  // 2026-04-26 (Codex P2 fix): client cross-game level_tag gondermesin diye server authoritative coerce.
  // Eski formul: `level_tag ?? (game === 'wordquest' ? 'B2' : null)` — sol-once eval ettigi icin
  // matematik+B2 -> 'B2' (yanlis). Yeni formul: `game === 'wordquest' ? (level_tag ?? 'B2') : null`.
  // Bu testler Codex review'un saglik duvari; regresyon yasanirsa kirilir.
  it('matematik (non-wordquest): client level_tag B2 gonderse bile DB payload NULL olur (cross-game guard)', async () => {
    const { POST } = await import('../route')
    const res = await POST(makePostBody({
      game: 'matematik',
      category: 'sayilar',
      difficulty: 3,
      level_tag: 'B2', // Client kotuye kullanim: TYT matematik'e CEFR seviyesi
      count: 1,
    }))

    expect(res.status).toBe(200)
    const payload = mockInsertCapture.mock.calls[0][0] as Array<Record<string, unknown>>
    // Server otoritatif: non-wordquest'e level_tag yazilmamali
    expect(payload[0].level_tag).toBeNull()
  })

  it('sosyal (non-wordquest): client level_tag C1 gonderse bile DB payload NULL olur', async () => {
    const { POST } = await import('../route')
    const res = await POST(makePostBody({
      game: 'sosyal',
      category: 'sosyoloji',
      difficulty: 3,
      level_tag: 'C1', // Client kotuye kullanim: sosyoloji'ye C1
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

describe('POST /api/admin/generate-questions — Turkce solution dil kontrolu (drift guard)', () => {
  // 2026-04-26: C2 prompt'u eski versiyonda Ingilizce CEFR rubrik iceriyordu;
  // Gemini bunun etkisinde solution'lari Ingilizce uretti. Iki katmanli onlem:
  //   1. Statik prompt testi: C2 rubrigi Turkce olmali (asil kaynaktan duzelt).
  //   2. Runtime testi: Ingilizce solution donerse insert filtrelenir (defense-in-depth).

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'test-key'
    mockCheckPermission.mockResolvedValue({ id: 'admin-1' })
  })

  afterEach(() => {
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY
  })

  it('C2 system prompt rubrigi Turkce karakterler icermeli (asil kaynaktan duzeltme)', async () => {
    mockGeminiResponse([VALID_AI_QUESTION])
    const { POST } = await import('../route')
    await POST(makePostBody({
      game: 'wordquest',
      category: 'vocabulary',
      difficulty: 4,
      level_tag: 'C2',
      count: 1,
    }))

    expect(fetchCalls).toHaveLength(1)
    const sentBody = fetchCalls[0].body as {
      system_instruction?: { parts?: Array<{ text?: string }> }
    }
    const systemText = sentBody.system_instruction?.parts?.[0]?.text ?? ''
    // C2 rubrigi Turkce karakter iceriyor olmali — onceki Ingilizce metin
    // ('Mastery: idiomatic native-like vocabulary...') Gemini'yi Ingilizce
    // solution'a yonlendiriyordu. Turkce karakter kontrolu basit ve guvenilir.
    expect(systemText).toMatch(/[çğıöşüÇĞİÖŞÜ]/)
    // Ileri seviye anlamli Turkce kelimeler beklenir (Mastery yerine "Ileri Duzey" gibi)
    expect(systemText).toMatch(/ileri|usta|yetkin|ana dili/i)
  })

  it('wordquest Ingilizce solution donerse o satir insert edilmez (drift filtre)', async () => {
    // Gemini bir gecerli (Turkce solution) + bir drift (Ingilizce solution) doner
    const turkishSolutionQ = {
      question: 'Which word means very happy? Pick the correct synonym.',
      options: ['sad', 'elated', 'angry', 'tired', 'bored'],
      answer: 1,
      solution: 'Elated kelimesi cok mutlu, sevincli anlamina gelir; bu durumda dogru cevaptir bence.',
      topic: 'Synonyms',
    }
    const englishDriftQ = {
      question: 'Which word means brave despite difficulty?',
      options: ['undaunted', 'tired', 'happy', 'sad', 'lazy'],
      answer: 0,
      // Saf Ingilizce — heuristic bunu reddetmeli
      solution: 'Undaunted means not intimidated or discouraged by difficulty, loss, or danger.',
      topic: 'Synonyms',
    }
    mockGeminiResponse([turkishSolutionQ, englishDriftQ])

    const { POST } = await import('../route')
    const res = await POST(makePostBody({
      game: 'wordquest',
      category: 'vocabulary',
      difficulty: 4,
      level_tag: 'C2',
      count: 2,
    }))

    expect(res.status).toBe(200)
    expect(mockInsertCapture).toHaveBeenCalledOnce()
    const payload = mockInsertCapture.mock.calls[0][0] as Array<Record<string, unknown>>
    // Sadece Turkce-solution'li 1 satir insert edilmeli, drift olan 2. satir filtrelenmeli
    expect(payload).toHaveLength(1)
    const inserted = payload[0]
    const content = inserted.content as { solution: string }
    expect(content.solution).toMatch(/anlamina gelir/i)
  })

  it('wordquest tum solution Ingilizce donerse 409 doner (hicbiri insert edilmez)', async () => {
    const allDrift = [
      {
        question: 'Which word best fits the context of complete fearlessness?',
        options: ['undaunted', 'tired', 'sleepy', 'hungry', 'sad'],
        answer: 0,
        solution: 'Undaunted means not intimidated by difficulty, loss, or danger really.',
        topic: 'Synonyms',
      },
      {
        question: 'Which word implies indirect language used in tense diplomacy?',
        options: ['veiled', 'happy', 'angry', 'simple', 'noisy'],
        answer: 0,
        solution: 'Veiled means not expressed directly, which avoids escalation in negotiations.',
        topic: 'Contextual Meaning',
      },
    ]
    mockGeminiResponse(allDrift)

    const { POST } = await import('../route')
    const res = await POST(makePostBody({
      game: 'wordquest',
      category: 'vocabulary',
      difficulty: 4,
      level_tag: 'C2',
      count: 2,
    }))

    expect(res.status).toBe(409)
    expect(mockInsertCapture).not.toHaveBeenCalled()
  })

  it('matematik (non-wordquest): solution dil kontrolu uygulanmaz (Turkce zaten kural)', async () => {
    // Drift filter sadece wordquest icin; diger oyunlarda solution Turkce demeti zaten
    // Zod min(5) ve prompt 'Türkçe yazılmalı' ile guvence altinda — gereksiz kontrol koymayalim.
    const mathQ = {
      question: 'A normal Turkish math question?',
      options: ['1','2','3','4','5'],
      answer: 0,
      // Hipotetik: Ingilizce gibi gorunen kisa solution — math icin filtreleme yok
      solution: 'The answer is one because basic arithmetic logic applies to this case directly.',
      topic: 'Aritmetik',
    }
    mockGeminiResponse([mathQ])
    const { POST } = await import('../route')
    const res = await POST(makePostBody({
      game: 'matematik',
      category: 'sayilar',
      difficulty: 2,
      count: 1,
    }))

    expect(res.status).toBe(200)
    expect(mockInsertCapture).toHaveBeenCalledOnce()
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

  // 2026-04-26 (Codex P2 fix): PUT manuel ekleme yolunda da ayni cross-game guard.
  it('matematik manuel ekleme: client level_tag A1 gonderse bile DB payload NULL olur (cross-game guard)', async () => {
    vi.resetModules()
    const { PUT } = await import('../route')
    const res = await PUT(makePutBody({
      game: 'matematik',
      category: 'sayilar',
      difficulty: 2,
      level_tag: 'A1', // Client kotuye kullanim
      question: 'Bir TYT matematik sorusu burada nedir?',
      options: ['1', '2', '3', '4', '5'],
      answer: 0,
      solution: 'Bu sorunun cevabi temel aritmetik mantigi ile bulunur.',
    }))

    expect(res.status).toBe(200)
    expect(mockInsertCapture).toHaveBeenCalledOnce()
    const payload = mockInsertCapture.mock.calls[0][0] as Record<string, unknown>
    // Server otoritatif: non-wordquest'e level_tag yazilmamali
    expect(payload.level_tag).toBeNull()
  })
})

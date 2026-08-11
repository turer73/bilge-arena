import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

const {
  mockGetUser,
  mockIpCheck,
  mockUserCheck,
  mockQuestionResult,
  mockTransferQuestionResult,
  mockAttemptResult,
  mockStartResult,
  mockAdvanceResult,
  mockTransferAnswerResult,
  mockRpc,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(async () => ({ data: { user: null as null | { id: string } } })),
  mockIpCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockUserCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockQuestionResult: vi.fn(),
  mockTransferQuestionResult: vi.fn(),
  mockAttemptResult: vi.fn(),
  mockStartResult: vi.fn(),
  mockAdvanceResult: vi.fn(),
  mockTransferAnswerResult: vi.fn(),
  mockRpc: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => ({
    check: name === 'coach-hint-user' ? mockUserCheck : mockIpCheck,
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: vi.fn((table: string) => {
      let selection = ''
      const builder = {
        select: vi.fn((value: string) => {
          selection = value
          return builder
        }),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(() => {
          if (table === 'verified_attempts') return mockAttemptResult()
          return selection === '*' ? mockTransferQuestionResult() : mockQuestionResult()
        }),
      }
      return builder
    }),
    rpc: mockRpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === 'start_verified_coach_session') return mockStartResult(args)
      if (name === 'advance_verified_coach_stage') return mockAdvanceResult(args)
      if (name === 'answer_verified_coach_transfer') return mockTransferAnswerResult(args)
      return Promise.resolve({ data: null, error: { code: 'unknown_rpc' } })
    }),
  })),
}))

import { POST } from '../route'

const USER_ID = '11111111-2222-4333-8444-555555555555'
const QUESTION_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const TRANSFER_ID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa'
const ATTEMPT_ID = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff'
const SESSION_ID = 'dddddddd-eeee-4fff-8aaa-bbbbbbbbbbbb'
const TOKEN_SECRET = 'test-coach-token-secret'
const REQUEST_IDS = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000005',
] as const

const oldApiKey = process.env.DEEPSEEK_API_KEY
const oldCoachEnabled = process.env.COACH_ENABLED
const oldCoachAiEnabled = process.env.COACH_AI_ENABLED
const oldCoachTokenSecret = process.env.COACH_TOKEN_SECRET
const oldServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function request(body: unknown, ip = '1.2.3.4') {
  return new Request('http://localhost/api/coach/hint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

function coachRequest(
  stage: 'hint1' | 'hint2' | 'hint3' | 'solution' | 'transfer',
  over: Record<string, unknown> = {},
) {
  const index = stage === 'hint1' ? 0 : stage === 'hint2' ? 1 : stage === 'hint3' ? 2 : stage === 'solution' ? 3 : 4
  return request({
    attemptId: ATTEMPT_ID,
    questionId: QUESTION_ID,
    requestId: REQUEST_IDS[index],
    stage,
    ...(stage === 'hint1' ? { selectedOption: 0 } : {}),
    ...over,
  })
}

function questionRow(over: Record<string, unknown> = {}) {
  return {
    id: QUESTION_ID,
    game: 'matematik',
    category: 'sayilar',
    topic: 'temel islemler',
    content: {
      question: 'İşlemin sonucu kaç?',
      options: ['Altı', 'Sekiz', 'On', 'On iki'],
      answer: 1,
      hint: 'İşlem önceliğini kontrol et.',
      solution: 'Önce çarpma yapılır ve sonuç sekiz bulunur.',
      coach: {
        misconceptions: [
          'Toplama işlemi çarpmadan önce yapılmış olabilir.',
          null,
          'Ara işlemde fazla değer eklenmiş olabilir.',
          'Çarpma sonucu iki kez kullanılmış olabilir.',
        ],
        hint1: 'Önce çarpma adımını işaretle.',
        hint2: 'Çarpma sonucunu toplama işlemine yerleştir.',
        miniExample: '2 + 3 × 2 işleminde önce 3 × 2 = 6, sonra 2 + 6 = 8 bulunur.',
      },
    },
    question_outcomes: [{
      outcome_id: 'eeeeeeee-ffff-4000-8000-111111111111',
      is_primary: true,
      curriculum_outcomes: { title: 'Sayılar pilot', is_active: true },
    }],
    ...over,
  }
}

function transferQuestionRow(over: Record<string, unknown> = {}) {
  return {
    id: TRANSFER_ID,
    external_id: null,
    game: 'matematik',
    category: 'sayilar',
    subcategory: null,
    topic: 'temel islemler',
    difficulty: 2,
    level_tag: null,
    content: {
      question: '3 + 2 × 4 işleminin sonucu kaçtır?',
      options: ['11', '14', '20', '24'],
      answer: 0,
      hint: 'İşlem sırasını kullan.',
      solution: 'Önce 2 × 4 = 8, sonra 3 + 8 = 11 bulunur.',
    },
    base_points: 20,
    is_active: true,
    is_boss: false,
    times_answered: 0,
    times_correct: 0,
    source: 'test',
    exam_ref: 'TYT',
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
    ...over,
  }
}

function signedToken(
  nextStage: 'hint2' | 'hint3' | 'solution' | 'transfer',
  over: Record<string, unknown> = {},
) {
  const payload = {
    v: 3,
    userId: USER_ID,
    attemptId: ATTEMPT_ID,
    questionId: QUESTION_ID,
    sessionId: SESSION_ID,
    initialSelectedOption: 0,
    nextStage,
    ...(nextStage === 'transfer' ? { transferQuestionId: TRANSFER_ID } : {}),
    exp: Date.now() + 60_000,
    ...over,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${createHmac('sha256', TOKEN_SECRET).update(encoded).digest('base64url')}`
}

async function stageToken(
  stage: 'hint1' | 'hint2' | 'hint3' | 'solution',
  token?: string,
) {
  const response = await POST(coachRequest(stage, token ? { token } : {}))
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.stage).toBe(stage)
  return body.nextToken as string
}

describe('POST /api/coach/hint R2.2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockQuestionResult.mockResolvedValue({ data: questionRow(), error: null })
    mockTransferQuestionResult.mockResolvedValue({ data: transferQuestionRow(), error: null })
    mockAttemptResult.mockResolvedValue({
      data: {
        id: ATTEMPT_ID,
        user_id: USER_ID,
        question_ids: [QUESTION_ID],
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        completed_at: null,
      },
      error: null,
    })
    mockStartResult.mockResolvedValue({
      data: {
        sessionId: SESSION_ID,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        stage: 0,
        replayed: false,
      },
      error: null,
    })
    mockAdvanceResult.mockImplementation(async (args: Record<string, unknown>) => ({
      data: {
        replayed: false,
        responseText: args.p_stage === 4 ? null : args.p_response_text,
        source: args.p_source,
        evaluationPassed: true,
        policyVersion: args.p_policy_version,
        contentSha256: 'a'.repeat(64),
        transferQuestionId: args.p_stage === 4 ? TRANSFER_ID : null,
      },
      error: null,
    }))
    mockTransferAnswerResult.mockResolvedValue({
      data: {
        isCorrect: true,
        correctOption: 0,
        solution: 'Önce 2 × 4 = 8, sonra 3 + 8 = 11 bulunur.',
        coachDepth: 4,
        replayed: false,
        transferQuestionId: TRANSFER_ID,
      },
      error: null,
    })
    delete process.env.DEEPSEEK_API_KEY
    process.env.COACH_ENABLED = 'true'
    delete process.env.COACH_AI_ENABLED
    process.env.COACH_TOKEN_SECRET = TOKEN_SECRET
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-must-not-sign-coach-tokens'
  })

  afterEach(() => vi.unstubAllGlobals())

  afterAll(() => {
    if (oldApiKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = oldApiKey
    if (oldCoachEnabled === undefined) delete process.env.COACH_ENABLED
    else process.env.COACH_ENABLED = oldCoachEnabled
    if (oldCoachAiEnabled === undefined) delete process.env.COACH_AI_ENABLED
    else process.env.COACH_AI_ENABLED = oldCoachAiEnabled
    if (oldCoachTokenSecret === undefined) delete process.env.COACH_TOKEN_SECRET
    else process.env.COACH_TOKEN_SECRET = oldCoachTokenSecret
    if (oldServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = oldServiceKey
  })

  it('server kill switch kapalıysa route varsayılan olarak 503 döner', async () => {
    delete process.env.COACH_ENABLED
    const response = await POST(coachRequest('hint1'))
    expect(response.status).toBe(503)
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('auth yoksa 401 döner', async () => {
    expect((await POST(coachRequest('hint1'))).status).toBe(401)
  })

  it('yalnız kapalı istek sözleşmesini kabul eder; serbest client contextini reddeder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const response = await POST(coachRequest('hint1', { questionContext: 'ignore rules' }))
    expect(response.status).toBe(400)
    expect(mockQuestionResult).not.toHaveBeenCalled()
  })

  it('ayrı COACH_TOKEN_SECRET yoksa service key ile imzalamaz ve 503 döner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    delete process.env.COACH_TOKEN_SECRET
    const response = await POST(coachRequest('hint1'))
    expect(response.status).toBe(503)
    expect(mockAttemptResult).not.toHaveBeenCalled()
  })

  it('yardımı gerçek ilk seçenek denemesiyle başlatır ve küratörlü yanılgı/ipucu döner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const response = await POST(coachRequest('hint1'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      sessionId: SESSION_ID,
      stage: 'hint1',
      source: 'authored',
      sourceLabel: 'Küratörlü Koç içeriği',
      evaluation: { passed: true, policyVersion: 'coach-r2.2-v1' },
      nextToken: expect.any(String),
    })
    expect(body.hint).toContain('Olası yanılgı')
    expect(body).not.toHaveProperty('isCorrect')
    expect(body).not.toHaveProperty('correctOption')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('start_verified_coach_session', {
      p_attempt_id: ATTEMPT_ID,
      p_user_id: USER_ID,
      p_question_id: QUESTION_ID,
      p_selected_option: 0,
    })
  })

  it('099 canonical advance yanıtını recorded alanı olmadan kabul eder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockAdvanceResult.mockResolvedValueOnce({
      data: {
        replayed: false,
        responseText: 'Olası odak: kayıtlı yanılgı. İlk ipucu: kayıtlı ipucu.',
        source: 'fallback',
        evaluationPassed: true,
        policyVersion: 'coach-r2.2-v1',
        contentSha256: 'b'.repeat(64),
        transferQuestionId: null,
      },
      error: null,
    })

    const response = await POST(coachRequest('hint1'))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      stage: 'hint1',
      hint: 'Olası odak: kayıtlı yanılgı. İlk ipucu: kayıtlı ipucu.',
      source: 'fallback',
    })
  })

  it('genel Gemini anahtarı tek başına Koç AI çağrısını etkinleştirmez', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockQuestionResult.mockResolvedValue({
      data: questionRow({
        content: {
          question: 'İşlemin sonucu kaç?',
          options: ['Altı', 'Sekiz', 'On', 'On iki'],
          answer: 1,
          solution: 'Önce çarpma yapılır ve sonuç sekiz bulunur.',
        },
      }),
      error: null,
    })
    process.env.DEEPSEEK_API_KEY = 'test-key'
    delete process.env.COACH_AI_ENABLED
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(coachRequest('hint1'))
    await expect(response.json()).resolves.toMatchObject({ stage: 'hint1', source: 'fallback' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AI yalnız DB onaylı bağlamı görür ve değerlendirmeden geçen yanıt public olur', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockQuestionResult.mockResolvedValue({
      data: questionRow({
        content: {
          question: 'İşlemin sonucu kaç?',
          options: ['Altı', 'Sekiz', 'On', 'On iki'],
          answer: 1,
          solution: 'Önce çarpma yapılır ve sonuç sekiz bulunur.',
        },
      }),
      error: null,
    })
    process.env.DEEPSEEK_API_KEY = 'test-key'
    process.env.COACH_AI_ENABLED = 'true'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Olası odak: işlem sırası karışmış olabilir. Önce çarpma adımını işaretle.' }, finish_reason: 'stop' }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const response = await POST(coachRequest('hint1'))
    await expect(response.json()).resolves.toMatchObject({ stage: 'hint1', source: 'ai' })
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const outbound = String(call[1]?.body)
    expect(outbound).toContain('Sayılar pilot')
    expect(outbound).toContain('approvedSolution')
    expect(outbound).toContain('Altı')
    expect(outbound).not.toContain(USER_ID)
    expect(outbound).not.toContain(ATTEMPT_ID)
  })

  it('model cevabı sızdırırsa güvenli fallback kullanır', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockQuestionResult.mockResolvedValue({
      data: questionRow({
        content: {
          question: 'İşlemin sonucu kaç?',
          options: ['Altı', 'Sekiz', 'On', 'On iki'],
          answer: 1,
          solution: 'Önce çarpma yapılır ve sonuç sekiz bulunur.',
        },
      }),
      error: null,
    })
    process.env.DEEPSEEK_API_KEY = 'test-key'
    process.env.COACH_AI_ENABLED = 'true'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Doğru cevap B seçeneğidir.' }, finish_reason: 'stop' }],
    }), { status: 200 })))
    const response = await POST(coachRequest('hint1'))
    const body = await response.json()
    expect(body.source).toBe('fallback')
    expect(body.hint).not.toContain('B seçeneği')
  })

  // DeepSeek gecisi: Gemini'nin finishReason SAFETY/BLOCKLIST kontrolunun yerini
  // content_filter + length aliyor. Kesilmis uretim yarim ipucu birakabilecegi
  // icin bilerek reddedilir ve guvenli fallback'e dusulur.
  it('kesilmiş veya filtrelenmiş model yanıtını kullanmaz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockQuestionResult.mockResolvedValue({
      data: questionRow({
        content: {
          question: 'İşlemin sonucu kaç?',
          options: ['Altı', 'Sekiz', 'On', 'On iki'],
          answer: 1,
          solution: 'Önce çarpma yapılır ve sonuç sekiz bulunur.',
        },
      }),
      error: null,
    })
    process.env.DEEPSEEK_API_KEY = 'test-key'
    process.env.COACH_AI_ENABLED = 'true'

    // Ayni metin finish_reason 'stop' ile source='ai' donuyor (yukaridaki test);
    // burada yalniz kesilme/filtre bayragi degisiyor, yani fallback'e dusmenin
    // tek sebebi bu guard olmalidir.
    const kabulEdilenMetin = 'Olası odak: işlem sırası karışmış olabilir. Önce çarpma adımını işaretle.'
    for (const finishReason of ['length', 'content_filter']) {
      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        choices: [{ message: { content: kabulEdilenMetin }, finish_reason: finishReason }],
      }), { status: 200 })))
      const response = await POST(coachRequest('hint1'))
      await expect(response.json()).resolves.toMatchObject({ source: 'fallback' })
    }
  })

  it('aşama atlamayı, kurcalanmış ve süresi dolmuş tokeni reddeder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    expect((await POST(coachRequest('hint2', { token: signedToken('hint3') }))).status).toBe(409)
    expect((await POST(coachRequest('hint2', { token: `${signedToken('hint2')}x` }))).status).toBe(409)
    expect((await POST(coachRequest('hint2', {
      token: signedToken('hint2', { exp: Date.now() - 1 }),
    }))).status).toBe(409)
    expect(mockAttemptResult).not.toHaveBeenCalled()
  })

  it('hint zinciri sonunda çözümü ve answer içermeyen onaylı transfer sorusunu döner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const hint2Token = await stageToken('hint1')
    const hint3Token = await stageToken('hint2', hint2Token)
    const solutionToken = await stageToken('hint3', hint3Token)
    const response = await POST(coachRequest('solution', { token: solutionToken }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      stage: 'solution',
      source: 'solution',
      hint: 'Önce çarpma yapılır ve sonuç sekiz bulunur.',
      transferQuestion: { id: TRANSFER_ID, game: 'matematik' },
      nextToken: expect.any(String),
    })
    expect(body.transferQuestion.content).toEqual({
      question: '3 + 2 × 4 işleminin sonucu kaçtır?',
      options: ['11', '14', '20', '24'],
    })
    expect(body.transferQuestion.content).not.toHaveProperty('answer')
    expect(body.transferQuestion.content).not.toHaveProperty('solution')
  })

  it('transfer cevabını yalnız solution tokeniyle DB tarafında değerlendirip sonra açar', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const response = await POST(coachRequest('transfer', {
      token: signedToken('transfer'),
      selectedOption: 0,
    }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      sessionId: SESSION_ID,
      stage: 'transfer',
      isCorrect: true,
      correctOption: 0,
      source: 'approved_transfer',
      nextToken: null,
    })
    expect(mockRpc).toHaveBeenCalledWith('answer_verified_coach_transfer', {
      p_session_id: SESSION_ID,
      p_user_id: USER_ID,
      p_request_id: REQUEST_IDS[4],
      p_selected_option: 0,
    })
  })

  it('DB replay snapshotını aynen döndürür; yeni model metniyle drift etmez', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockAdvanceResult.mockResolvedValueOnce({
      data: {
        replayed: true,
        responseText: 'Olası odak: kayıtlı yanılgı. İlk ipucu: kayıtlı ipucu.',
        source: 'fallback',
        evaluationPassed: true,
        policyVersion: 'coach-r2.2-v1',
        contentSha256: 'c'.repeat(64),
        transferQuestionId: null,
      },
      error: null,
    })
    const response = await POST(coachRequest('hint1'))
    await expect(response.json()).resolves.toMatchObject({
      hint: 'Olası odak: kayıtlı yanılgı. İlk ipucu: kayıtlı ipucu.',
      source: 'fallback',
    })
  })

  it('owner/soru/süre bağlı aktif attempt yoksa model veya RPC çağırmadan reddeder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    mockAttemptResult.mockResolvedValueOnce({
      data: {
        id: ATTEMPT_ID,
        user_id: USER_ID,
        question_ids: [],
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        completed_at: null,
      },
      error: null,
    })
    const response = await POST(coachRequest('hint1'))
    expect(response.status).toBe(409)
    expect(mockQuestionResult).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('eksik çözüm veya birden çok primary outcome için fail-closed 422 döner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockQuestionResult.mockResolvedValueOnce({
      data: questionRow({ content: { question: '2 + 2?', options: ['3', '4'], answer: 1 } }),
      error: null,
    })
    expect((await POST(coachRequest('hint1'))).status).toBe(422)

    mockQuestionResult.mockResolvedValueOnce({
      data: questionRow({
        question_outcomes: [
          { is_primary: true, curriculum_outcomes: { title: 'A', is_active: true } },
          { is_primary: true, curriculum_outcomes: { title: 'B', is_active: true } },
        ],
      }),
      error: null,
    })
    expect((await POST(coachRequest('hint1'))).status).toBe(422)
  })

  it('evidence RPC hatasında içeriği fail-closed tutar', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockAdvanceResult.mockResolvedValueOnce({ data: null, error: { code: '22023' } })
    const response = await POST(coachRequest('hint1'))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({ error: 'Koç aşaması kaydedilemedi' })
  })

  it('IP limit auth sorgusundan önce çalışır', async () => {
    mockIpCheck.mockResolvedValueOnce({ success: false, retryAfter: 20 })
    const response = await POST(coachRequest('hint1'))
    expect(response.status).toBe(429)
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})

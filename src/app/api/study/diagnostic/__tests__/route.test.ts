import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetUser,
  mockIpCheck,
  mockUserCheck,
  mockFrom,
  mockRpc,
  mockEq,
  tableLists,
  tableSingles,
  tableErrors,
  rpcResults,
  rpcQueues,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(async () => ({ data: { user: null as null | { id: string } } })),
  mockIpCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockUserCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockEq: vi.fn(),
  tableLists: {} as Record<string, unknown[]>,
  tableSingles: {} as Record<string, unknown>,
  tableErrors: {} as Record<string, unknown>,
  rpcResults: {} as Record<string, { data: unknown; error: unknown }>,
  rpcQueues: {} as Record<string, Array<{ data: unknown; error: unknown }>>,
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => ({
    check: name === 'adaptive-diagnostic-user' ? mockUserCheck : mockIpCheck,
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: mockFrom.mockImplementation((table: string) => {
      const result = () => ({ data: tableLists[table] ?? [], error: tableErrors[table] ?? null })
      const singleResult = () => ({ data: tableSingles[table] ?? null, error: tableErrors[table] ?? null })
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn(() => builder)
      builder.eq = vi.fn((column: string, value: unknown) => {
        mockEq(table, column, value)
        return builder
      })
      builder.is = vi.fn((column: string, value: unknown) => {
        mockEq(table, column, value)
        return builder
      })
      builder.in = vi.fn(() => builder)
      builder.order = vi.fn(() => builder)
      builder.limit = vi.fn(() => builder)
      builder.maybeSingle = vi.fn(async () => singleResult())
      builder.then = (
        resolve: (value: unknown) => unknown,
        reject: (reason: unknown) => unknown,
      ) => Promise.resolve(result()).then(resolve, reject)
      return builder
    }),
    rpc: mockRpc.mockImplementation((name: string, args: unknown) => {
      const result = rpcQueues[name]?.shift() ?? rpcResults[name] ?? { data: null, error: null }
      return Promise.resolve({ ...result, args })
    }),
  })),
}))

import { GET, POST } from '../route'

const USER_ID = '11111111-2222-4333-8444-555555555555'
const SESSION_ID = '22222222-3333-4444-8555-666666666666'
const REQUEST_ID = '33333333-4444-4555-8666-777777777777'
const categories = ['sayilar', 'denklemler', 'fonksiyonlar', 'problemler', 'geometri', 'olasilik']
const outcomeIds = categories.map((_, index) => `10000000-0000-4000-8000-00000000000${index}`)
const questionIds = Array.from({ length: 12 }, (_, index) => `20000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`)

const outcomes = categories.map((category, index) => ({
  id: outcomeIds[index],
  code: `MAT-${index}`,
  title: `Kazanım ${index}`,
  category,
  sort_order: index,
}))

function question(index: number) {
  const categoryIndex = index < 6 ? index : index - 6
  return {
    id: questionIds[index],
    external_id: null,
    game: 'matematik',
    category: categories[categoryIndex],
    subcategory: null,
    topic: null,
    difficulty: index < 6 ? 3 : 4,
    level_tag: null,
    content: {
      question: `Soru ${index}`,
      options: ['A', 'B', 'C', 'D'],
      answer: 1,
      solution: `Gizli çözüm ${index}`,
      hint: `Gizli ipucu ${index}`,
    },
    base_points: 30,
    is_active: true,
    is_boss: false,
    times_answered: 0,
    times_correct: 0,
    source: 'test',
    exam_ref: 'TYT',
    created_at: '2026-08-08T00:00:00.000Z',
    updated_at: '2026-08-08T00:00:00.000Z',
  }
}

const questions = questionIds.map((_, index) => question(index))
const mappings = questions.map((row, index) => ({
  question_id: row.id,
  outcome_id: outcomeIds[index < 6 ? index : index - 6],
}))
const releasedDiagnosticScope = {
  game: 'matematik',
  displayExamRef: 'TYT',
  questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-math-v1',
  mappingMode: 'category_proxy',
  diagnosticEnabled: true,
}
const releasedDiagnosticV3Scope = {
  game: 'matematik',
  displayExamRef: 'TYT',
  questionExamRef: 'TYT',
  taxonomyVersion: 'ba-tyt-math-v1',
  policyVersion: 'adaptive-diagnostic-v3',
  questionCount: 10,
  outcomeCount: 6,
  maxPerOutcome: 2,
}

function snapshotQuestion(index: number) {
  const row = questions[index]
  return {
    id: row.id,
    game: row.game,
    category: row.category,
    subcategory: row.subcategory,
    topic: row.topic,
    difficulty: row.difficulty,
    level_tag: row.level_tag,
    base_points: row.base_points,
    content: { question: row.content.question, options: row.content.options },
  }
}

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: SESSION_ID,
    user_id: USER_ID,
    game: 'matematik',
    exam_ref: 'TYT',
    taxonomy_version: 'ba-tyt-math-v1',
    kind: 'initial',
    status: 'active',
    current_question_id: questionIds[0],
    current_question_revision_id: '50000000-0000-4000-8000-000000000000',
    current_question_correct_option: 1,
    current_question_option_count: 4,
    current_question_outcome_id: outcomeIds[0],
    current_question_difficulty: 3,
    answered_count: 0,
    covered_outcomes: 0,
    expires_at: '2099-08-08T12:00:00.000Z',
    created_at: '2026-08-08T10:00:00.000Z',
    ...overrides,
  }
}

function stateRows() {
  return outcomes.map((outcome, index) => ({
    outcome_id: outcome.id,
    score: index * 15,
    recommended_difficulty: (index % 5) + 1,
    attempts: index < 4 ? 2 : 1,
    correct_attempts: index % 2,
    last_diagnosed_at: `2026-08-08T10:00:0${index}.000Z`,
  }))
}

function recordedAnswer(index: number) {
  const row = questions[index]
  return {
    question_id: row.id,
    outcome_id: mappings[index].outcome_id,
    difficulty: row.difficulty,
    is_correct: index % 2 === 0,
    selected_option: index % 2 === 0 ? 1 : 0,
    sequence: index + 1,
    response_time_ms: 1200,
    request_id: index === 0 ? REQUEST_ID : `30000000-0000-4000-8000-0000000000${String(index).padStart(2, '0')}`,
    next_question_id: questionIds[index + 1] ?? null,
    status_after: index === 9 ? 'completed' : 'active',
    covered_outcomes_after: Math.min(index + 1, 6),
  }
}

function getRequest(query = 'game=matematik&exam_ref=TYT') {
  return new Request(`http://localhost/api/study/diagnostic?${query}`, {
    headers: { 'x-forwarded-for': '1.2.3.4' },
  })
}

function postRequest(body: unknown) {
  return new Request('http://localhost/api/study/diagnostic', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  })
}

describe('/api/study/diagnostic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const key of Object.keys(tableLists)) delete tableLists[key]
    for (const key of Object.keys(tableSingles)) delete tableSingles[key]
    for (const key of Object.keys(tableErrors)) delete tableErrors[key]
    for (const key of Object.keys(rpcResults)) delete rpcResults[key]
    for (const key of Object.keys(rpcQueues)) delete rpcQueues[key]
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    tableLists.curriculum_outcomes = outcomes
    tableLists.questions = questions
    tableLists.question_outcomes = mappings
    tableLists.user_diagnostic_outcome_state = []
    tableLists.adaptive_diagnostic_answers = []
    tableSingles.adaptive_diagnostic_sessions = session()
    tableSingles.questions = questions[0]
    rpcResults.resolve_released_curriculum_scope = {
      data: releasedDiagnosticScope,
      error: null,
    }
    rpcResults.resolve_released_diagnostic_scope = {
      data: releasedDiagnosticV3Scope,
      error: null,
    }
    rpcResults.start_adaptive_diagnostic = {
      data: {
        sessionId: SESSION_ID,
        currentQuestionId: questionIds[0],
        kind: 'initial',
        answeredCount: 0,
        coveredOutcomes: 0,
        expiresAt: '2099-08-08T12:00:00.000Z',
        resumed: false,
      },
      error: null,
    }
    rpcResults.start_adaptive_diagnostic_v3 = rpcResults.start_adaptive_diagnostic
    rpcResults.get_adaptive_diagnostic_question_v2 = { data: snapshotQuestion(0), error: null }
    rpcResults.record_adaptive_diagnostic_answer_v2 = {
      data: {
        alreadyProcessed: false,
        status: 'active',
        nextQuestionId: questionIds[1],
        answeredCount: 1,
        coveredOutcomes: 1,
      },
      error: null,
    }
    rpcResults.record_adaptive_diagnostic_answer_v3 = rpcResults.record_adaptive_diagnostic_answer_v2
  })

  it('applies IP, auth, and user rate-limit gates', async () => {
    mockIpCheck.mockResolvedValueOnce({ success: false, retryAfter: 7 })
    expect((await GET(getRequest() as never)).status).toBe(429)

    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(getRequest() as never)).status).toBe(401)

    mockUserCheck.mockResolvedValueOnce({ success: false, retryAfter: 9 })
    expect((await GET(getRequest() as never)).status).toBe(429)
  })

  it('returns unsupported when the exact requested scope has no diagnostic release', async () => {
    rpcResults.resolve_released_diagnostic_scope = { data: null, error: null }
    const response = await GET(getRequest('game=fen&exam_ref=TYT') as never)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      supported: false, game: 'fen', examRef: 'TYT', policy: null, session: null, summary: null,
    })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('resolve_released_diagnostic_scope', {
      p_game: 'fen', p_display_exam_ref: 'TYT',
    })
  })

  it('fails closed when the exact diagnostic scope is absent or malformed', async () => {
    rpcResults.resolve_released_diagnostic_scope = { data: null, error: null }
    const getResponse = await GET(getRequest() as never)
    expect(getResponse.status).toBe(200)
    await expect(getResponse.json()).resolves.toEqual({
      supported: false, game: 'matematik', examRef: 'TYT', policy: null, session: null, summary: null,
    })
    expect(mockFrom).not.toHaveBeenCalled()

    rpcResults.resolve_released_diagnostic_scope = {
      data: { ...releasedDiagnosticV3Scope, questionCount: 99 },
      error: null,
    }
    const startResponse = await POST(postRequest({
      action: 'start', game: 'matematik', examRef: 'TYT',
    }) as never)
    expect(startResponse.status).toBe(500)
    expect(mockRpc).not.toHaveBeenCalledWith('start_adaptive_diagnostic_v3', expect.anything())

    rpcResults.resolve_released_diagnostic_scope = {
      data: { ...releasedDiagnosticV3Scope, taxonomyVersion: 'ba-tyt-math-v2' },
      error: null,
    }
    const answerResponse = await POST(postRequest({
      action: 'answer', sessionId: SESSION_ID, questionId: questionIds[0],
      selectedOption: 1, responseTimeMs: 1200, requestId: REQUEST_ID,
    }) as never)
    expect(answerResponse.status).toBe(409)
    expect(mockRpc).not.toHaveBeenCalledWith('record_adaptive_diagnostic_answer_v3', expect.anything())
  })

  it('uses the legacy Math path only while the v3 resolver is missing', async () => {
    rpcResults.resolve_released_diagnostic_scope = { data: null, error: { code: 'PGRST202' } }
    tableSingles.adaptive_diagnostic_sessions = null
    const response = await POST(postRequest({
      action: 'start', game: 'matematik', examRef: 'TYT',
    }) as never)
    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('start_adaptive_diagnostic', expect.objectContaining({
      p_first_question_id: questionIds[0],
    }))
    expect(mockRpc).not.toHaveBeenCalledWith('start_adaptive_diagnostic_v3', expect.anything())

    const fen = await GET(getRequest('game=fen&exam_ref=TYT') as never)
    expect(fen.status).toBe(200)
    await expect(fen.json()).resolves.toMatchObject({ supported: false, game: 'fen' })
  })

  it('records a legacy Math session through v2 while the resolver is missing', async () => {
    rpcResults.resolve_released_diagnostic_scope = { data: null, error: { code: '42883' } }
    rpcQueues.get_adaptive_diagnostic_question_v2 = [
      { data: snapshotQuestion(0), error: null },
      { data: snapshotQuestion(1), error: null },
    ]
    const response = await POST(postRequest({
      action: 'answer', sessionId: SESSION_ID, questionId: questionIds[0],
      selectedOption: 1, responseTimeMs: 1200, requestId: REQUEST_ID,
    }) as never)
    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('record_adaptive_diagnostic_answer_v2', expect.objectContaining({
      p_question_id: questionIds[0], p_next_question_id: questionIds[1],
    }))
    expect(mockRpc).not.toHaveBeenCalledWith('record_adaptive_diagnostic_answer_v3', expect.anything())
  })

  it('starts an exact non-Math scope through the registry-driven v3 contract', async () => {
    const fenScope = {
      game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-fen-v2', policyVersion: 'adaptive-diagnostic-v3',
      questionCount: 6, outcomeCount: 3, maxPerOutcome: 2,
    }
    const fenIndexes = [0, 1, 2, 6, 7, 8]
    rpcResults.resolve_released_diagnostic_scope = { data: fenScope, error: null }
    tableLists.curriculum_outcomes = outcomes.slice(0, 3)
    tableLists.questions = fenIndexes.map((index) => ({ ...questions[index], game: 'fen' }))
    tableLists.question_outcomes = fenIndexes.map((index) => mappings[index])
    rpcResults.get_adaptive_diagnostic_question_v2 = {
      data: { ...snapshotQuestion(0), game: 'fen' }, error: null,
    }
    rpcResults.start_adaptive_diagnostic_v3 = {
      data: {
        sessionId: SESSION_ID,
        currentQuestionId: questionIds[0],
        kind: 'initial',
        answeredCount: 0,
        coveredOutcomes: 0,
        expiresAt: '2099-08-08T12:00:00.000Z',
        resumed: false,
      },
      error: null,
    }

    const response = await POST(postRequest({ action: 'start', game: 'fen', examRef: 'TYT' }) as never)
    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('start_adaptive_diagnostic_v3', expect.objectContaining({
      p_game: 'fen', p_display_exam_ref: 'TYT', p_first_question_id: questionIds[0],
    }))
    expect(mockEq).toHaveBeenCalledWith('question_outcomes', 'mapping_source', 'taxonomy_auto')
    await expect(response.json()).resolves.toMatchObject({
      supported: true,
      game: 'fen',
      examRef: 'TYT',
      policy: { questionCount: 6, outcomeCount: 3, maxPerOutcome: 2 },
      session: { progress: { total: 6, totalOutcomes: 3 } },
    })
  })

  it('keeps display and storage exam refs separate for Wordquest', async () => {
    rpcResults.resolve_released_diagnostic_scope = {
      data: {
        game: 'wordquest', displayExamRef: 'YDT', questionExamRef: null,
        taxonomyVersion: 'ba-ydt-english-v1', policyVersion: 'adaptive-diagnostic-v3',
        questionCount: 10, outcomeCount: 6, maxPerOutcome: 2,
      },
      error: null,
    }
    tableLists.questions = questions.map((row) => ({ ...row, game: 'wordquest', exam_ref: null }))
    rpcResults.get_adaptive_diagnostic_question_v2 = {
      data: { ...snapshotQuestion(0), game: 'wordquest' }, error: null,
    }

    const response = await POST(postRequest({ action: 'start', game: 'wordquest', examRef: 'YDT' }) as never)
    expect(response.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('questions', 'exam_ref', null)
    expect(mockRpc).toHaveBeenCalledWith('start_adaptive_diagnostic_v3', expect.objectContaining({
      p_game: 'wordquest', p_display_exam_ref: 'YDT',
    }))
    await expect(response.json()).resolves.toMatchObject({ game: 'wordquest', examRef: 'YDT' })
  })

  it('rejects malformed query and strict POST bodies', async () => {
    expect((await GET(getRequest('game=unknown&exam_ref=TYT') as never)).status).toBe(400)
    expect((await GET(getRequest('game=fen&exam_ref=tyt') as never)).status).toBe(400)
    expect((await POST(postRequest({ action: 'start', game: 'matematik', examRef: 'TYT', extra: true }) as never)).status).toBe(400)
    expect((await POST(postRequest({
      action: 'answer', sessionId: 'bad', questionId: questionIds[0],
      selectedOption: 1, responseTimeMs: 1000, requestId: REQUEST_ID,
    }) as never)).status).toBe(400)
  })

  it('starts with a safe public question and no answer-bearing fields', async () => {
    tableSingles.adaptive_diagnostic_sessions = null
    const response = await POST(postRequest({ action: 'start', game: 'matematik', examRef: 'TYT' }) as never)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    const payload = await response.json()
    expect(payload).toMatchObject({
      supported: true,
      game: 'matematik',
      examRef: 'TYT',
      policy: { version: 'adaptive-diagnostic-v3', questionCount: 10, outcomeCount: 6, maxPerOutcome: 2 },
      session: {
        id: SESSION_ID,
        status: 'active',
        progress: { answered: 0, total: 10, coveredOutcomes: 0, totalOutcomes: 6 },
        question: { id: questionIds[0], content: { question: 'Soru 0', options: ['A', 'B', 'C', 'D'] } },
      },
      summary: null,
    })
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('Gizli çözüm')
    expect(serialized).not.toContain('Gizli ipucu')
    expect(serialized).not.toContain('"answer"')
    expect(serialized).not.toContain('outcome_id')
  })

  it('grades only on the server, advances adaptively, and does not disclose correctness', async () => {
    rpcQueues.get_adaptive_diagnostic_question_v2 = [
      { data: snapshotQuestion(0), error: null },
      { data: snapshotQuestion(1), error: null },
    ]
    const response = await POST(postRequest({
      action: 'answer',
      sessionId: SESSION_ID,
      questionId: questionIds[0],
      selectedOption: 1,
      responseTimeMs: 1200,
      requestId: REQUEST_ID,
    }) as never)
    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('record_adaptive_diagnostic_answer_v3', expect.objectContaining({
      p_question_id: questionIds[0],
      p_selected_option: 1,
      p_next_question_id: questionIds[1],
    }))
    const payload = await response.json()
    expect(payload.session.question.id).toBe(questionIds[1])
    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('isCorrect')
    expect(serialized).not.toContain('correctOption')
    expect(serialized).not.toContain('solution')
  })

  it('selects the next question from issued outcome and difficulty despite live catalog drift', async () => {
    tableLists.questions = [{ ...questions[0], difficulty: 5 }, ...questions.slice(1)]
    tableLists.question_outcomes = [
      { question_id: questionIds[0], outcome_id: outcomeIds[1] },
      ...mappings.slice(1),
    ]
    rpcQueues.get_adaptive_diagnostic_question_v2 = [
      { data: snapshotQuestion(0), error: null },
      { data: snapshotQuestion(1), error: null },
    ]
    const response = await POST(postRequest({
      action: 'answer', sessionId: SESSION_ID, questionId: questionIds[0],
      selectedOption: 1, responseTimeMs: 1200, requestId: REQUEST_ID,
    }) as never)
    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('record_adaptive_diagnostic_answer_v3', expect.objectContaining({
      p_next_question_id: questionIds[1],
    }))
  })

  it('replays a recorded answer without regrading or changing its next snapshot', async () => {
    tableSingles.adaptive_diagnostic_sessions = session({
      current_question_id: questionIds[1], answered_count: 1, covered_outcomes: 1,
    })
    tableLists.adaptive_diagnostic_answers = [recordedAnswer(0)]
    rpcResults.get_adaptive_diagnostic_question_v2 = { data: snapshotQuestion(1), error: null }
    rpcResults.record_adaptive_diagnostic_answer_v2.data = {
      alreadyProcessed: true,
      status: 'active',
      nextQuestionId: questionIds[1],
      answeredCount: 1,
      coveredOutcomes: 1,
    }
    const response = await POST(postRequest({
      action: 'answer',
      sessionId: SESSION_ID,
      questionId: questionIds[0],
      selectedOption: 3,
      responseTimeMs: 9999,
      requestId: REQUEST_ID,
    }) as never)
    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('record_adaptive_diagnostic_answer_v3', expect.objectContaining({
      p_selected_option: 1,
      p_response_time_ms: 1200,
      p_next_question_id: questionIds[1],
    }))
  })

  it('returns 409 for a stale fresh question and 400 for an out-of-range option', async () => {
    tableSingles.adaptive_diagnostic_sessions = session({ current_question_id: questionIds[1] })
    expect((await POST(postRequest({
      action: 'answer', sessionId: SESSION_ID, questionId: questionIds[0],
      selectedOption: 1, responseTimeMs: 1200, requestId: REQUEST_ID,
    }) as never)).status).toBe(409)

    tableSingles.adaptive_diagnostic_sessions = session()
    tableSingles.questions = { ...questions[0], content: { ...questions[0].content, options: ['A', 'B'], answer: 1 } }
    tableLists.questions = [{ ...questions[0], content: { ...questions[0].content, options: ['A', 'B'], answer: 1 } }, ...questions.slice(1)]
    expect((await POST(postRequest({
      action: 'answer', sessionId: SESSION_ID, questionId: questionIds[0],
      selectedOption: 4, responseTimeMs: 1200, requestId: REQUEST_ID,
    }) as never)).status).toBe(400)
  })

  it('accepts the tenth option index when the issued immutable snapshot has ten choices', async () => {
    const tenOptions = Array.from({ length: 10 }, (_, index) => `Seçenek ${index + 1}`)
    tableSingles.adaptive_diagnostic_sessions = session({
      current_question_correct_option: 9,
      current_question_option_count: 10,
    })
    tableSingles.questions = {
      ...questions[0],
      content: { ...questions[0].content, options: tenOptions, answer: 9 },
    }
    tableLists.questions = [{
      ...questions[0],
      content: { ...questions[0].content, options: tenOptions, answer: 9 },
    }, ...questions.slice(1)]
    rpcQueues.get_adaptive_diagnostic_question_v2 = [{
      data: {
        ...snapshotQuestion(0),
        content: { question: questions[0].content.question, options: tenOptions },
      },
      error: null,
    }, {
      data: snapshotQuestion(1),
      error: null,
    }]

    const response = await POST(postRequest({
      action: 'answer', sessionId: SESSION_ID, questionId: questionIds[0],
      selectedOption: 9, responseTimeMs: 1200, requestId: REQUEST_ID,
    }) as never)

    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('record_adaptive_diagnostic_answer_v3', expect.objectContaining({
      p_selected_option: 9,
    }))
  })

  it('persists expiry as abandoned without grading a question', async () => {
    tableSingles.adaptive_diagnostic_sessions = session({ expires_at: '2000-01-01T00:00:00.000Z' })
    rpcResults.record_adaptive_diagnostic_answer_v2.data = {
      alreadyProcessed: false,
      status: 'abandoned',
      nextQuestionId: null,
      answeredCount: 0,
      coveredOutcomes: 0,
    }
    const response = await POST(postRequest({
      action: 'answer', sessionId: SESSION_ID, questionId: questionIds[0],
      selectedOption: 1, responseTimeMs: 1200, requestId: REQUEST_ID,
    }) as never)
    expect(response.status).toBe(200)
    expect((await response.json()).session.status).toBe('abandoned')
    expect(mockRpc).toHaveBeenCalledWith('record_adaptive_diagnostic_answer_v3', expect.objectContaining({
      p_selected_option: 1,
    }))
  })

  it('returns an ID-free six-outcome summary only after the tenth answer', async () => {
    tableSingles.adaptive_diagnostic_sessions = session({
      current_question_id: questionIds[9],
      current_question_revision_id: '50000000-0000-4000-8000-000000000009',
      answered_count: 9,
      covered_outcomes: 6,
    })
    tableSingles.questions = questions[9]
    tableLists.adaptive_diagnostic_answers = Array.from({ length: 9 }, (_, index) => recordedAnswer(index))
    tableLists.user_diagnostic_outcome_state = stateRows()
    rpcResults.get_adaptive_diagnostic_question_v2 = { data: snapshotQuestion(9), error: null }
    rpcResults.record_adaptive_diagnostic_answer_v2.data = {
      alreadyProcessed: false,
      status: 'completed',
      nextQuestionId: null,
      answeredCount: 10,
      coveredOutcomes: 6,
    }
    const response = await POST(postRequest({
      action: 'answer', sessionId: SESSION_ID, questionId: questionIds[9],
      selectedOption: 1, responseTimeMs: 1200,
      requestId: '44444444-5555-4666-8777-888888888888',
    }) as never)
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload.session).toMatchObject({ status: 'completed', question: null })
    expect(payload.summary.outcomes).toHaveLength(6)
    expect(payload.summary.outcomes[0]).toMatchObject({
      code: 'MAT-0', title: 'Kazanım 0', category: 'sayilar', recommendedDifficulty: 1,
    })
    const serialized = JSON.stringify(payload.summary)
    for (const id of outcomeIds) expect(serialized).not.toContain(id)
    expect(serialized).not.toContain(USER_ID)
    expect(serialized).not.toContain(SESSION_ID)
  })

  it('fails closed on malformed RPC payloads or partial diagnostic state', async () => {
    tableSingles.adaptive_diagnostic_sessions = null
    rpcResults.start_adaptive_diagnostic.data = { sessionId: SESSION_ID, currentQuestionId: questionIds[0] }
    expect((await POST(postRequest({ action: 'start', game: 'matematik', examRef: 'TYT' }) as never)).status).toBe(500)

    tableLists.user_diagnostic_outcome_state = stateRows().slice(0, 5)
    expect((await GET(getRequest() as never)).status).toBe(500)
  })
})

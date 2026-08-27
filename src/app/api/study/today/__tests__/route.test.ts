import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { QuestionRow } from '@/lib/utils/question-public'

const {
  mockGetUser,
  mockRpc,
  mockFetchDue,
  mockIssueVerifiedAttempt,
  tableMocks,
} = vi.hoisted(() => {
  function makeTableMock(defaultResult: { data: unknown; error: unknown }) {
    const queue: Array<{ data: unknown; error: unknown }> = []
    const calls: Array<{ methods: Array<{ name: string; args: unknown[] }> }> = []
    const updateCalls: unknown[] = []

    const from = vi.fn(() => {
      const call = { methods: [] as Array<{ name: string; args: unknown[] }> }
      calls.push(call)
      const chain: Record<string, unknown> = {}
      for (const name of ['select', 'eq', 'is', 'in', 'order', 'limit']) {
        chain[name] = vi.fn((...args: unknown[]) => {
          call.methods.push({ name, args })
          return chain
        })
      }
      chain.update = vi.fn((value: unknown) => {
        updateCalls.push(value)
        call.methods.push({ name: 'update', args: [value] })
        return chain
      })
      const take = () => Promise.resolve(queue.shift() ?? defaultResult)
      chain.maybeSingle = vi.fn(take)
      chain.single = vi.fn(take)
      chain.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => (
        take().then(resolve, reject)
      )
      return chain
    })

    return {
      from,
      calls,
      updateCalls,
      push: (result: { data: unknown; error?: unknown }) => queue.push({
        data: result.data,
        error: result.error ?? null,
      }),
      reset: () => {
        queue.length = 0
        calls.length = 0
        updateCalls.length = 0
        from.mockClear()
      },
    }
  }

  return {
    mockGetUser: vi.fn(),
    mockRpc: vi.fn(),
    mockFetchDue: vi.fn(),
    mockIssueVerifiedAttempt: vi.fn(),
    tableMocks: {
      profiles: makeTableMock({ data: { exam_type: null }, error: null }),
      daily_plan: makeTableMock({ data: null, error: null }),
      daily_plan_items: makeTableMock({ data: [], error: null }),
      questions: makeTableMock({ data: [], error: null }),
      curriculum_outcomes: makeTableMock({ data: [], error: null }),
      user_outcome_state: makeTableMock({ data: [], error: null }),
      question_outcomes: makeTableMock({ data: [], error: null }),
      user_question_history: makeTableMock({ data: [], error: null }),
    },
  }
})
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn((table: keyof typeof tableMocks) => {
      const mock = tableMocks[table]
      if (!mock) throw new Error(`unexpected table: ${table}`)
      return mock.from()
    }),
  })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn(() => ({ check: vi.fn(async () => ({ success: true })) })),
}))

vi.mock('@/lib/review/due-questions', () => ({ fetchDueQuestions: mockFetchDue }))
vi.mock('@/lib/verified-attempts', () => ({
  issueVerifiedAttempt: mockIssueVerifiedAttempt,
  toPublicVerifiedQuestions: (snapshots: unknown[]) => snapshots,
}))

import { GET, PATCH } from '../route'

const U1 = '11111111-1111-4111-8111-111111111111'

function uid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

function makeQuestionRow(id: string, overrides: Partial<QuestionRow> = {}): QuestionRow {
  return {
    id,
    external_id: null,
    game: 'matematik',
    category: 'sayilar',
    subcategory: null,
    topic: null,
    difficulty: 2,
    level_tag: null,
    content: { question: `Soru ${id}`, options: ['A', 'B', 'C', 'D'], answer: 1, solution: 'gizli' },
    base_points: 20,
    is_active: true,
    is_boss: false,
    times_answered: 0,
    times_correct: 0,
    source: null,
    exam_ref: 'TYT',
    published_revision_id: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  }
}

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/study/today')
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  return new Request(url, { headers: { 'x-forwarded-for': '1.2.3.4' } })
}

function makePatchRequest(body: unknown) {
  return new Request('http://localhost/api/study/today', {
    method: 'PATCH',
    headers: { 'x-forwarded-for': '1.2.3.4', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function releasedScope(args: Record<string, unknown>) {
  if (args.p_game !== 'matematik' || args.p_display_exam_ref !== 'TYT') {
    return { data: null, error: null }
  }
  return {
    data: {
      game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
      taxonomyVersion: 'ba-tyt-math-v1', mappingMode: 'category_proxy', diagnosticEnabled: true,
    },
    error: null,
  }
}

function installDefaultRpc() {
  mockRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'resolve_released_curriculum_scope') return releasedScope(args)
    throw new Error(`unexpected RPC: ${name}`)
  })
}

function installCreateRpcSuccess() {
  mockRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === 'resolve_released_curriculum_scope') return releasedScope(args)
    if (name !== 'create_daily_plan_v2') throw new Error(`unexpected RPC: ${name}`)
    const items = args.p_items as Array<Record<string, unknown>>
    return {
      data: {
        planId: uid(900),
        game: args.p_game,
        planDate: args.p_plan_date,
        examRef: args.p_exam_ref,
        questionIds: items.map((item) => item.question_id),
        completedIds: [],
        items: items.map((item) => ({
          questionId: item.question_id,
          position: item.position,
          slotType: item.slot_type,
          sourceType: item.source_type,
          completed: false,
        })),
      },
      error: null,
    }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  for (const mock of Object.values(tableMocks)) mock.reset()
  mockGetUser.mockResolvedValue({ data: { user: { id: U1 } } })
  mockFetchDue.mockResolvedValue([])
  mockIssueVerifiedAttempt.mockImplementation(async (_admin: unknown, input: { game: string; questionIds: string[] }) => ({
    attemptId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    expiresAt: '2099-01-01T00:00:00.000Z',
    questionSnapshots: input.questionIds.map(id => ({
      id,
      game: input.game,
      category: 'sayilar',
      subcategory: null,
      topic: null,
      difficulty: 2,
      level_tag: null,
      base_points: 20,
      content: { question: `Soru ${id}`, options: ['A', 'B', 'C', 'D'] },
    })),
  }))
  mockRpc.mockReset()
  installDefaultRpc()
})

describe('GET /api/study/today', () => {
  it('auth ve parametre sinirlarini uygular', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await GET(makeGetRequest({ game: 'matematik' }) as never)).status).toBe(401)

    expect((await GET(makeGetRequest({ game: 'gecersiz' }) as never)).status).toBe(400)
    expect((await GET(makeGetRequest({ game: 'matematik', exam_ref: 'LGS_OR_1_1' }) as never)).status).toBe(400)
    expect((await GET(makeGetRequest({ game: 'matematik', choice_category: 'fizik' }) as never)).status).toBe(400)
  })

  it('mevcut V2 snapshotini sirali item metadatasi ve guvenli sorularla dondurur', async () => {
    const questionIds = [uid(1), uid(2)]
    tableMocks.daily_plan.push({
      data: {
        id: uid(800),
        plan_date: '2026-08-08',
        exam_ref: 'TYT',
        question_ids: questionIds,
        completed_ids: [questionIds[0]],
      },
    })
    tableMocks.daily_plan_items.push({
      data: [
        { question_id: questionIds[0], position: 1, slot_type: 'due', source_type: 'due', completed_at: '2026-08-08T10:00:00Z' },
        { question_id: questionIds[1], position: 2, slot_type: 'weak_outcome', source_type: 'fresh', completed_at: null },
      ],
    })
    tableMocks.questions.push({ data: questionIds.map((id) => makeQuestionRow(id)) })

    const response = await GET(makeGetRequest({ game: 'matematik' }) as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.questions.map((question: { id: string }) => question.id)).toEqual(questionIds)
    expect(body.questions[0].content).not.toHaveProperty('answer')
    expect(body.questions[0].content).not.toHaveProperty('solution')
    expect(body.items).toEqual([
      expect.objectContaining({ questionId: questionIds[0], position: 1, slotType: 'due', sourceType: 'due', completed: true }),
      expect.objectContaining({ questionId: questionIds[1], position: 2, slotType: 'weak_outcome', sourceType: 'fresh', completed: false }),
    ])
    expect(body.items[0]).not.toHaveProperty('sourceRef')
    expect(mockFetchDue).not.toHaveBeenCalled()
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('itemi olmayan ayni-gun legacy plana acik legacy metadata sentezler', async () => {
    const questionId = uid(3)
    tableMocks.daily_plan.push({
      data: {
        id: uid(801),
        plan_date: '2026-08-08',
        exam_ref: 'TYT',
        question_ids: [questionId],
        completed_ids: [questionId],
      },
    })
    tableMocks.daily_plan_items.push({ data: [] })
    tableMocks.questions.push({ data: [makeQuestionRow(questionId)] })

    const body = await (await GET(makeGetRequest({ game: 'matematik' }) as never)).json()

    expect(body.items).toEqual([expect.objectContaining({
      questionId,
      slotType: 'legacy',
      sourceType: 'legacy',
      completed: true,
    })])
  })

  it('yeni plani 5/5/3/1/1 olarak atomik RPC ile olusturur', async () => {
    tableMocks.daily_plan.push({ data: null })
    const due = Array.from({ length: 5 }, (_, index) => makeQuestionRow(uid(index + 1)))
    const weak = Array.from({ length: 5 }, (_, index) => makeQuestionRow(uid(index + 6)))
    const target = [
      makeQuestionRow(uid(11), { category: 'problemler' }),
      makeQuestionRow(uid(12), { category: 'problemler' }),
      makeQuestionRow(uid(13), { category: 'problemler' }),
      makeQuestionRow(uid(15), { category: 'problemler' }),
    ]
    const challenge = makeQuestionRow(uid(14), { category: 'geometri', difficulty: 5 })
    const allQuestions = [...due, ...weak, ...target, challenge]
    const weakOutcome = uid(701)
    const currentOutcome = uid(702)

    mockFetchDue.mockResolvedValue(due)
    tableMocks.questions.push({ data: allQuestions })
    tableMocks.curriculum_outcomes.push({ data: [
      { id: weakOutcome, code: 'MAT-WEAK', category: 'sayilar', sort_order: 1 },
      { id: currentOutcome, code: 'MAT-NEXT', category: 'problemler', sort_order: 2 },
    ] })
    tableMocks.user_question_history.push({ data: [] })
    tableMocks.user_outcome_state.push({ data: [
      {
        outcome_id: weakOutcome,
        attempts: 5,
        correct_attempts: 1,
        weighted_earned: 1,
        weighted_possible: 5,
        delayed_correct: 0,
        last_answered_at: '2026-08-07T10:00:00Z',
      },
    ] })
    tableMocks.question_outcomes.push({ data: [
      ...weak.map((question) => ({ question_id: question.id, outcome_id: weakOutcome })),
      ...target.slice(0, 3).map((question) => ({ question_id: question.id, outcome_id: currentOutcome })),
    ] })
    tableMocks.questions.push({ data: allQuestions })
    installCreateRpcSuccess()

    const response = await GET(makeGetRequest({
      game: 'matematik',
      exam_ref: 'TYT',
      choice_category: 'problemler',
    }) as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    const createCall = mockRpc.mock.calls.find(([name]) => name === 'create_daily_plan_v2')
    expect(createCall).toBeDefined()
    const rpcItems = (createCall?.[1] as { p_items: Array<{ slot_type: string; source_type: string }> }).p_items
    expect(rpcItems).toHaveLength(15)
    expect(Object.fromEntries([
      'due', 'weak_outcome', 'current_target', 'challenge', 'student_choice',
    ].map((slot) => [slot, rpcItems.filter((item) => item.slot_type === slot).length]))).toEqual({
      due: 5,
      weak_outcome: 5,
      current_target: 3,
      challenge: 1,
      student_choice: 1,
    })
    expect(rpcItems.filter((item) => item.source_type === 'due')).toHaveLength(5)
    expect(rpcItems.filter((item) => item.source_type === 'weak_outcome')).toHaveLength(5)
    expect(rpcItems.filter((item) => item.source_type === 'current_target')).toHaveLength(3)
    expect(rpcItems.filter((item) => item.source_type === 'challenge')).toHaveLength(1)
    expect(rpcItems.filter((item) => item.source_type === 'student_choice')).toHaveLength(1)
    expect(new Set(body.questions.map((question: { id: string }) => question.id)).size).toBe(15)
    expect(body.items).toHaveLength(15)
    expect(mockIssueVerifiedAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      userId: U1,
      mode: 'practice',
      questionIds: expect.any(Array),
    }))
  })

  it('eksik ogrenme kovalarini belgeli fresh fallback ile deterministik doldurur', async () => {
    tableMocks.daily_plan.push({ data: null })
    const questions = Array.from({ length: 15 }, (_, index) => makeQuestionRow(uid(100 + index), { difficulty: 3 }))
    tableMocks.questions.push({ data: questions })
    tableMocks.curriculum_outcomes.push({ data: [] })
    tableMocks.user_question_history.push({ data: [] })
    tableMocks.questions.push({ data: questions })
    installCreateRpcSuccess()

    const response = await GET(makeGetRequest({ game: 'matematik', exam_ref: 'TYT' }) as never)
    expect(response.status).toBe(200)
    const createCall = mockRpc.mock.calls.find(([name]) => name === 'create_daily_plan_v2')
    const items = (createCall?.[1] as { p_items: Array<{ source_type: string; position: number }> }).p_items
    expect(items).toHaveLength(15)
    expect(items.every((item) => item.source_type === 'fresh')).toBe(true)
    expect(items.map((item) => item.position)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1))
  })

  it('aday sorgularini sinirli tutar ve profilin LGS varsayilanini uygular', async () => {
    tableMocks.profiles.push({ data: { exam_type: 'lgs' } })
    tableMocks.daily_plan.push({ data: null })
    tableMocks.questions.push({ data: [] })
    tableMocks.curriculum_outcomes.push({ data: [] })
    tableMocks.user_question_history.push({ data: [] })

    const response = await GET(makeGetRequest({ game: 'matematik' }) as never)

    expect(response.status).toBe(200)
    expect(mockFetchDue).toHaveBeenCalledWith(expect.anything(), U1, 'matematik', null, null, 'LGS', 'exact')
    expect(tableMocks.questions.calls[0].methods).toContainEqual({ name: 'limit', args: [300] })
    expect(tableMocks.questions.calls[0].methods).toContainEqual({ name: 'eq', args: ['exam_ref', 'LGS'] })
    expect(tableMocks.user_question_history.calls[0].methods).toContainEqual({ name: 'limit', args: [50] })
  })

  it('uyumsuz stale exam_ref ile snapshot olusturmaz', async () => {
    tableMocks.profiles.push({ data: { exam_type: 'lgs' } })

    const response = await GET(makeGetRequest({ game: 'matematik', exam_ref: 'TYT' }) as never)

    expect(response.status).toBe(400)
    expect(mockFetchDue).not.toHaveBeenCalled()
    expect(mockRpc.mock.calls.some(([name]) => name === 'create_daily_plan_v2')).toBe(false)
  })

  it('tum havuzlar bossa bos snapshot yazmadan null bilet doner', async () => {
    tableMocks.daily_plan.push({ data: null })
    tableMocks.questions.push({ data: [] })
    tableMocks.curriculum_outcomes.push({ data: [] })
    tableMocks.user_question_history.push({ data: [] })

    const response = await GET(makeGetRequest({ game: 'matematik', exam_ref: 'TYT' }) as never)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      planDate: expect.any(String),
      game: 'matematik',
      examRef: 'TYT',
      questions: [],
      completedIds: [],
      items: [],
      attemptId: null,
      expiresAt: null,
    })
    expect(mockRpc.mock.calls.some(([name]) => name === 'create_daily_plan_v2')).toBe(false)
    expect(mockIssueVerifiedAttempt).not.toHaveBeenCalled()
  })

  it('aday sorgu hatasinda ve create RPC hatasinda kismi plan dondurmez', async () => {
    tableMocks.daily_plan.push({ data: null })
    tableMocks.questions.push({ data: null, error: { code: '08006' } })
    tableMocks.curriculum_outcomes.push({ data: [] })
    tableMocks.user_question_history.push({ data: [] })
    expect((await GET(makeGetRequest({ game: 'matematik', exam_ref: 'TYT' }) as never)).status).toBe(500)
    expect(mockRpc.mock.calls.map(([name]) => name)).toEqual(['resolve_released_curriculum_scope'])

    for (const mock of Object.values(tableMocks)) mock.reset()
    tableMocks.daily_plan.push({ data: null })
    const question = makeQuestionRow(uid(200), { difficulty: 3 })
    tableMocks.questions.push({ data: [question] })
    tableMocks.curriculum_outcomes.push({ data: [] })
    tableMocks.user_question_history.push({ data: [] })
    mockRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => (
      name === 'resolve_released_curriculum_scope'
        ? releasedScope(args)
        : { data: null, error: { code: '22023' } }
    ))
    expect((await GET(makeGetRequest({ game: 'matematik', exam_ref: 'TYT' }) as never)).status).toBe(500)
    expect(mockIssueVerifiedAttempt).not.toHaveBeenCalled()
  })

  it('gecersiz RPC cevabinda ve bilet hatasinda fail closed davranir', async () => {
    tableMocks.daily_plan.push({ data: null })
    const question = makeQuestionRow(uid(210), { difficulty: 3 })
    tableMocks.questions.push({ data: [question] })
    tableMocks.curriculum_outcomes.push({ data: [] })
    tableMocks.user_question_history.push({ data: [] })
    mockRpc.mockImplementation(async (name: string, args: Record<string, unknown>) => (
      name === 'resolve_released_curriculum_scope'
        ? releasedScope(args)
        : { data: { planId: 'not-a-uuid' }, error: null }
    ))
    expect((await GET(makeGetRequest({ game: 'matematik', exam_ref: 'TYT' }) as never)).status).toBe(500)

    for (const mock of Object.values(tableMocks)) mock.reset()
    tableMocks.daily_plan.push({
      data: {
        id: uid(810),
        plan_date: '2026-08-08',
        exam_ref: 'TYT',
        question_ids: [question.id],
        completed_ids: [],
      },
    })
    tableMocks.daily_plan_items.push({ data: [] })
    tableMocks.questions.push({ data: [question] })
    mockIssueVerifiedAttempt.mockRejectedValueOnce(new Error('secret database detail'))

    const response = await GET(makeGetRequest({ game: 'matematik' }) as never)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Plan baslatilamadi' })
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('PATCH /api/study/today', () => {
  it('auth ve bulunamayan plan sinirlarini uygular', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await PATCH(makePatchRequest({ game: 'matematik', questionIds: [] }) as never)).status).toBe(401)

    tableMocks.daily_plan.push({ data: null })
    expect((await PATCH(makePatchRequest({ game: 'matematik', questionIds: [uid(1)] }) as never)).status).toBe(404)
  })

  it('V2 tamamlamayi owner-korumali RPC ile yapar ve plan disi idyi gondermez', async () => {
    const planId = uid(820)
    const questionIds = [uid(1), uid(2)]
    const outside = uid(999)
    tableMocks.daily_plan.push({ data: {
      id: planId,
      question_ids: questionIds,
      completed_ids: [],
    } })
    mockRpc.mockResolvedValue({
      data: {
        planId,
        game: 'matematik',
        planDate: '2026-08-08',
        examRef: null,
        questionIds,
        completedIds: [questionIds[1]],
        items: [
          { questionId: questionIds[0], position: 1, slotType: 'due', sourceType: 'due', completed: false },
          { questionId: questionIds[1], position: 2, slotType: 'weak_outcome', sourceType: 'fresh', completed: true },
        ],
      },
      error: null,
    })

    const response = await PATCH(makePatchRequest({
      game: 'matematik',
      questionIds: [questionIds[1], outside],
    }) as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('complete_daily_plan_items', {
      p_user_id: U1,
      p_plan_id: planId,
      p_question_ids: [questionIds[1]],
    })
    expect(body.completedIds).toEqual([questionIds[1]])
    expect(body.items[1]).toEqual(expect.objectContaining({ completed: true, sourceLabel: 'Yeni soru' }))
    expect(tableMocks.daily_plan.updateCalls).toHaveLength(0)
  })

  it('legacy planda tamamlananlari atomik RPC ile birlestirir ve plan disi idyi yok sayar', async () => {
    const planIds = [uid(1), uid(2), uid(3)]
    const outside = uid(999)
    tableMocks.daily_plan.push({ data: {
      id: uid(830),
      question_ids: planIds,
      completed_ids: [planIds[0]],
    } })
    mockRpc.mockResolvedValue({
      data: {
        planId: uid(830),
        game: 'matematik',
        planDate: '2026-08-08',
        examRef: null,
        questionIds: planIds,
        completedIds: [planIds[0], planIds[1]],
        items: [],
      },
      error: null,
    })

    const response = await PATCH(makePatchRequest({
      game: 'matematik',
      questionIds: [planIds[1], outside],
    }) as never)

    expect(response.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith('complete_daily_plan_items', {
      p_user_id: U1,
      p_plan_id: uid(830),
      p_question_ids: [planIds[1]],
    })
    expect(tableMocks.daily_plan.updateCalls).toHaveLength(0)
    expect(await response.json()).toEqual({
      completedIds: [planIds[0], planIds[1]],
      items: [
        expect.objectContaining({ questionId: planIds[0], sourceType: 'legacy', completed: true }),
        expect.objectContaining({ questionId: planIds[1], sourceType: 'legacy', completed: true }),
        expect.objectContaining({ questionId: planIds[2], sourceType: 'legacy', completed: false }),
      ],
    })
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetUser,
  mockIpCheck,
  mockUserCheck,
  mockNodeResult,
  mockOutcomeResult,
  mockStateResult,
  mockDiagnosticResult,
  mockDiagnosticScopeResult,
  mockScopeResult,
  mockIntegrityResult,
  mockSocialContextResult,
  mockSocialStateResult,
  mockFrom,
  mockRpc,
  mockEq,
  mockSelect,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(async () => ({ data: { user: null as null | { id: string } } })),
  mockIpCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockUserCheck: vi.fn(async () => ({ success: true, retryAfter: 0 })),
  mockNodeResult: vi.fn(),
  mockOutcomeResult: vi.fn(),
  mockStateResult: vi.fn(),
  mockDiagnosticResult: vi.fn(),
  mockDiagnosticScopeResult: vi.fn(),
  mockScopeResult: vi.fn(),
  mockIntegrityResult: vi.fn(),
  mockSocialContextResult: vi.fn(),
  mockSocialStateResult: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockEq: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: vi.fn((name: string) => ({
    check: name === 'mastery-map-user' ? mockUserCheck : mockIpCheck,
  })),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({
    from: mockFrom.mockImplementation((table: string) => {
      const result = table === 'curriculum_nodes'
        ? mockNodeResult
        : table === 'curriculum_outcomes'
          ? mockOutcomeResult
          : table === 'user_diagnostic_outcome_state'
            ? mockDiagnosticResult
            : mockStateResult
      const builder: Record<string, unknown> = {}
      builder.select = vi.fn((columns: string) => {
        mockSelect(table, columns)
        return builder
      })
      builder.eq = vi.fn((column: string, value: unknown) => {
        mockEq(table, column, value)
        return builder
      })
      builder.order = vi.fn(() => builder)
      builder.in = vi.fn(() => Promise.resolve(result()))
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => (
        Promise.resolve(result()).then(resolve, reject)
      )
      return builder
    }),
    rpc: mockRpc.mockImplementation((name: string) => {
      if (name === 'resolve_released_curriculum_scope') return Promise.resolve(mockScopeResult())
      if (name === 'resolve_released_diagnostic_scope') return Promise.resolve(mockDiagnosticScopeResult())
      if (name === 'curriculum_scope_integrity') return Promise.resolve(mockIntegrityResult())
      if (name === 'resolve_tyt_social_mastery_read_context') return Promise.resolve(mockSocialContextResult())
      if (name === 'read_tyt_social_mastery_outcome_state') return Promise.resolve(mockSocialStateResult())
      throw new Error(`unexpected rpc: ${name}`)
    }),
  })),
}))

import { GET } from '../route'

const USER_ID = '11111111-2222-3333-4444-555555555555'
const OUTCOME_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const COURSE_ID = '10000000-0000-4000-8000-000000000001'
const UNIT_ID = '10000000-0000-4000-8000-000000000002'
const TOPIC_ID = '10000000-0000-4000-8000-000000000003'
const LEAF_ID = '10000000-0000-4000-8000-000000000004'
const SOCIAL_PHILOSOPHY_OUTCOME_ID = '20000000-0000-4000-8000-000000000001'
const SOCIAL_RELIGION_OUTCOME_ID = '20000000-0000-4000-8000-000000000002'
const SOCIAL_COURSE_ID = '20000000-0000-4000-8000-000000000003'
const SOCIAL_UNIT_ID = '20000000-0000-4000-8000-000000000004'
const SOCIAL_TOPIC_ID = '20000000-0000-4000-8000-000000000005'
const SOCIAL_PHILOSOPHY_LEAF_ID = '20000000-0000-4000-8000-000000000006'
const SOCIAL_RELIGION_LEAF_ID = '20000000-0000-4000-8000-000000000007'
const SOCIAL_EVENT_ID = '20000000-0000-4000-8000-000000000008'

const NODES = [
  { id: COURSE_ID, code: 'course', node_type: 'course', title: 'TYT Matematik', parent_id: null, sort_order: 1 },
  { id: UNIT_ID, code: 'unit', node_type: 'unit', title: 'Sayılar ve Cebir', parent_id: COURSE_ID, sort_order: 1 },
  { id: TOPIC_ID, code: 'topic', node_type: 'topic', title: 'Sayılar', parent_id: UNIT_ID, sort_order: 1 },
  { id: LEAF_ID, code: 'leaf', node_type: 'outcome', title: 'Sayılar ve işlem', parent_id: TOPIC_ID, sort_order: 1 },
]

const OUTCOMES = [{
  id: OUTCOME_ID,
  node_id: LEAF_ID,
  code: 'MAT-SAY-01',
  game: 'matematik',
  category: 'sayilar',
  title: 'Sayılar ve işlem becerisi',
  description: 'Bilge Arena iç öğrenme grafiği',
  exam_ref: 'TYT',
}]

const FEN_NODES = NODES.map((node, index) => ({
  ...node,
  code: ['fen-course', 'fen-unit', 'fen-topic', 'fen-leaf'][index],
  title: ['TYT Fen Bilimleri', 'Fizik', 'Fizik', 'Fiziksel akıl yürütme'][index],
}))
const FEN_OUTCOMES = [{
  ...OUTCOMES[0],
  code: 'FEN-FIZ-01',
  game: 'fen',
  category: 'fizik',
  title: 'Fiziksel akıl yürütme becerisi',
}]

const SOCIAL_NODES = [
  { id: SOCIAL_COURSE_ID, code: 'social-course', node_type: 'course', title: 'TYT Sosyal', parent_id: null, sort_order: 1 },
  { id: SOCIAL_UNIT_ID, code: 'social-unit', node_type: 'unit', title: 'Sosyal Bilimler', parent_id: SOCIAL_COURSE_ID, sort_order: 1 },
  { id: SOCIAL_TOPIC_ID, code: 'social-topic', node_type: 'topic', title: 'Felsefe ve Din', parent_id: SOCIAL_UNIT_ID, sort_order: 1 },
  { id: SOCIAL_PHILOSOPHY_LEAF_ID, code: 'social-philosophy-leaf', node_type: 'outcome', title: 'Felsefi düşünme', parent_id: SOCIAL_TOPIC_ID, sort_order: 1 },
  { id: SOCIAL_RELIGION_LEAF_ID, code: 'social-religion-leaf', node_type: 'outcome', title: 'Din kültürü', parent_id: SOCIAL_TOPIC_ID, sort_order: 2 },
]
const SOCIAL_OUTCOMES = [
  {
    id: SOCIAL_PHILOSOPHY_OUTCOME_ID,
    node_id: SOCIAL_PHILOSOPHY_LEAF_ID,
    code: 'SOS-FEL-01',
    game: 'sosyal',
    category: 'felsefe',
    title: 'Felsefi düşünme becerisi',
    description: 'Bilge Arena iç öğrenme grafiği',
    exam_ref: 'TYT',
  },
  {
    id: SOCIAL_RELIGION_OUTCOME_ID,
    node_id: SOCIAL_RELIGION_LEAF_ID,
    code: 'SOS-DIN-01',
    game: 'sosyal',
    category: 'din_kulturu',
    title: 'Din kültürü bilgisi',
    description: 'Bilge Arena iç öğrenme grafiği',
    exam_ref: 'TYT',
  },
]

function request(query = 'game=matematik&exam_ref=TYT') {
  return new Request(`http://localhost/api/profile/mastery?${query}`, {
    headers: { 'x-forwarded-for': '1.2.3.4' },
  })
}

describe('GET /api/profile/mastery', () => {
  afterEach(() => vi.unstubAllEnvs())

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('TYT_SOCIAL_V2_LEARNER_ENABLED', 'true')
    vi.stubEnv('NEXT_PUBLIC_TYT_SOCIAL_V2_ENABLED', 'true')
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockNodeResult.mockReturnValue({ data: NODES, error: null })
    mockOutcomeResult.mockReturnValue({ data: OUTCOMES, error: null })
    mockStateResult.mockReturnValue({ data: [], error: null })
    mockDiagnosticResult.mockReturnValue({ data: [], error: null })
    mockDiagnosticScopeResult.mockReturnValue({
      data: {
        game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-math-v1', policyVersion: 'adaptive-screening-v1',
        questionCount: 10, outcomeCount: 6, maxPerOutcome: 2,
      },
      error: null,
    })
    mockScopeResult.mockReturnValue({
      data: {
        game: 'matematik',
        displayExamRef: 'TYT',
        questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-math-v1',
        mappingMode: 'category_proxy',
        diagnosticEnabled: true,
      },
      error: null,
    })
    mockIntegrityResult.mockReturnValue({
      data: {
        total: 1, mapped: 1, unmapped: 0, scopeMismatch: 0,
        nodeOrphan: 0, outcomeOrphan: 0, primaryMismatch: 0, emptyOutcome: 0,
      },
      error: null,
    })
    mockSocialContextResult.mockReturnValue({
      data: {
        status: 'active',
        available: true,
        reason: null,
        policyVersion: 'tyt-social-2026-v1',
        taxonomyVersion: 'ba-tyt-sosyal-v1',
        variant: 'questions_16_20',
        selectionEventId: SOCIAL_EVENT_ID,
        selectionEffectiveAt: '2026-08-31T08:00:00.000Z',
        allowedCategories: ['cografya', 'din_kulturu', 'felsefe', 'sosyoloji', 'tarih'],
        rebuildRequired: false,
        legacyAggregateUsed: false,
      },
      error: null,
    })
    mockSocialStateResult.mockReturnValue({ data: [], error: null })
  })

  it('auth yoksa 401 doner', async () => {
    const response = await GET(request() as never)
    expect(response.status).toBe(401)
  })

  it('gecersiz oyun ve exam_ref parametrelerini reddeder', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    expect((await GET(request('game=bilinmeyen') as never)).status).toBe(400)
    expect((await GET(request('game=matematik&exam_ref=%3Cscript%3E') as never)).status).toBe(400)
  })

  it('release edilmemis scope icin veri sorgusu yapmadan acik unsupported doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockScopeResult.mockReturnValueOnce({ data: null, error: null })
    const response = await GET(request('game=fen&exam_ref=TYT') as never)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      game: 'fen',
      examRef: 'TYT',
      coverage: {
        supported: false,
        diagnosticAvailable: false,
        taxonomyVersion: null,
        totalQuestions: 0,
        mappedQuestions: 0,
        percentage: 0,
      },
      discovery: null,
      graph: null,
      outcomes: [],
    })
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledTimes(1)
    expect(mockRpc).toHaveBeenCalledWith('resolve_released_curriculum_scope', {
      p_game: 'fen', p_display_exam_ref: 'TYT',
    })
  })

  it('ham kanittan UUIDsiz, aciklanabilir dort seviyeli harita uretir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockStateResult.mockReturnValue({
      data: [{
        outcome_id: OUTCOME_ID,
        attempts: 5,
        correct_attempts: 4,
        weighted_earned: '4.000',
        weighted_possible: '5.000',
        delayed_correct: 1,
        v2_attempts: 5,
        difficulty_weighted_earned: '12.000',
        difficulty_weighted_possible: '15.000',
        timed_attempts: 5,
        total_time_sec: '75.000',
        fast_wrong: 1,
        hinted_attempts: 1,
        hint_stage_sum: '2.000',
        guess_annotations: 0,
        careless_annotations: 0,
        verified_evidence_days: 3,
        last_answered_at: '2026-07-22T08:00:00Z',
      }],
      error: null,
    })
    mockDiagnosticResult.mockReturnValue({ data: [{ outcome_id: OUTCOME_ID }], error: null })

    const response = await GET(request() as never)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.coverage).toEqual({
      supported: true,
      diagnosticAvailable: true,
      taxonomyVersion: 'ba-tyt-math-v1',
      totalQuestions: 1,
      mappedQuestions: 1,
      percentage: 100,
    })
    expect(body.graph).toMatchObject({
      code: 'course',
      nodeType: 'course',
      children: [{ children: [{ children: [{ outcomeCode: 'MAT-SAY-01' }] }] }],
    })
    expect(body.discovery).toEqual({
      level: 3,
      stage: 'ready',
      diagnosticCompleted: true,
      evidenceCollected: 3,
      evidenceTarget: 3,
      readyOutcomes: 1,
      totalOutcomes: 1,
      journeyPercentage: 100,
    })
    expect(body.outcomes[0]).toMatchObject({
      code: 'MAT-SAY-01',
      path: ['TYT Matematik', 'Sayılar ve Cebir', 'Sayılar', 'Sayılar ve işlem'],
      attempts: 5,
      accuracy: 80,
      difficultyAccuracy: 80,
      averageTimeSec: 15,
      modelVersion: 'evidence-v2',
      status: 'mastered',
      verifiedEvidenceDays: 3,
    })
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain(USER_ID)
    expect(serialized).not.toContain(OUTCOME_ID)
    expect(serialized).not.toContain(LEAF_ID)
  })

  it('exam_ref degerini normalize edip tum DB sorgularina exact uygular', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    await GET(request('game=matematik&exam_ref=tyt') as never)
    expect(mockEq).toHaveBeenCalledWith('curriculum_nodes', 'exam_ref', 'TYT')
    expect(mockEq).toHaveBeenCalledWith('curriculum_outcomes', 'exam_ref', 'TYT')
    expect(mockEq).toHaveBeenCalledWith('curriculum_nodes', 'taxonomy_version', 'ba-tyt-math-v1')
    expect(mockEq).toHaveBeenCalledWith('curriculum_outcomes', 'taxonomy_version', 'ba-tyt-math-v1')
    expect(mockEq).toHaveBeenCalledWith('user_diagnostic_outcome_state', 'user_id', USER_ID)
  })

  it('aynı gündeki çoklu cevaplarla Keşif seviyesini hazır göstermez', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockStateResult.mockReturnValue({
      data: [{
        outcome_id: OUTCOME_ID,
        attempts: 5,
        correct_attempts: 5,
        weighted_earned: '5.000',
        weighted_possible: '5.000',
        delayed_correct: 0,
        v2_attempts: 5,
        difficulty_weighted_earned: '15.000',
        difficulty_weighted_possible: '15.000',
        timed_attempts: 5,
        total_time_sec: '75.000',
        fast_wrong: 0,
        hinted_attempts: 0,
        hint_stage_sum: '0.000',
        guess_annotations: 0,
        careless_annotations: 0,
        verified_evidence_days: 1,
        last_answered_at: '2026-07-22T08:00:00Z',
      }],
      error: null,
    })
    mockDiagnosticResult.mockReturnValue({ data: [{ outcome_id: OUTCOME_ID }], error: null })

    const response = await GET(request() as never)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.discovery).toMatchObject({
      level: 2,
      stage: 'evidence',
      evidenceCollected: 1,
      readyOutcomes: 0,
    })
    expect(body.outcomes[0]).toMatchObject({ attempts: 5, verifiedEvidenceDays: 1 })
  })

  it('migration 202 öncesinde eksik gün kolonunu sıfır kanıtla fail-closed okur', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockStateResult
      .mockReturnValueOnce({ data: null, error: { code: '42703' } })
      .mockReturnValueOnce({
        data: [{
          outcome_id: OUTCOME_ID,
          attempts: 5,
          correct_attempts: 5,
          weighted_earned: '5.000',
          weighted_possible: '5.000',
          delayed_correct: 0,
          v2_attempts: 5,
          difficulty_weighted_earned: '15.000',
          difficulty_weighted_possible: '15.000',
          timed_attempts: 5,
          total_time_sec: '75.000',
          fast_wrong: 0,
          hinted_attempts: 0,
          hint_stage_sum: '0.000',
          guess_annotations: 0,
          careless_annotations: 0,
          last_answered_at: '2026-07-22T08:00:00Z',
        }],
        error: null,
      })
    mockDiagnosticResult.mockReturnValue({ data: [{ outcome_id: OUTCOME_ID }], error: null })

    const response = await GET(request() as never)
    const body = await response.json()
    expect(response.status).toBe(200)
    expect(body.outcomes[0]).toMatchObject({ attempts: 5, verifiedEvidenceDays: 0 })
    expect(body.discovery).toMatchObject({
      level: 2,
      stage: 'evidence',
      evidenceCollected: 0,
      readyOutcomes: 0,
    })
    const stateSelections = mockSelect.mock.calls
      .filter(([table]) => table === 'user_outcome_state')
      .map(([, columns]) => String(columns))
    expect(stateSelections).toHaveLength(2)
    expect(stateSelections[0]).toContain('verified_evidence_days')
    expect(stateSelections[1]).not.toContain('verified_evidence_days')
  })

  it('eksik kolon dışındaki state hatalarını fallback ile yutmaz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockStateResult.mockReturnValue({ data: null, error: { code: '42501' } })

    const response = await GET(request() as never)
    expect(response.status).toBe(500)
    expect(mockSelect.mock.calls.filter(([table]) => table === 'user_outcome_state')).toHaveLength(1)
  })

  it('released TYT Fen scopeunu registry taksonomisiyle acar ve matematik tanilamasini calistirmaz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockScopeResult.mockReturnValueOnce({
      data: {
        game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-fen-v1', mappingMode: 'category_proxy', diagnosticEnabled: false,
      },
      error: null,
    })
    mockNodeResult.mockReturnValueOnce({ data: FEN_NODES, error: null })
    mockOutcomeResult.mockReturnValueOnce({ data: FEN_OUTCOMES, error: null })

    const response = await GET(request('game=fen&exam_ref=TYT') as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      game: 'fen', examRef: 'TYT',
      coverage: {
        supported: true, diagnosticAvailable: false,
        taxonomyVersion: 'ba-tyt-fen-v1', percentage: 100,
      },
      discovery: { level: 1, stage: 'estimate', diagnosticCompleted: false },
      outcomes: [{ code: 'FEN-FIZ-01', game: 'fen', category: 'fizik' }],
    })
    expect(mockEq).toHaveBeenCalledWith('curriculum_nodes', 'taxonomy_version', 'ba-tyt-fen-v1')
    expect(mockEq).toHaveBeenCalledWith('curriculum_outcomes', 'taxonomy_version', 'ba-tyt-fen-v1')
    expect(mockFrom).not.toHaveBeenCalledWith('user_diagnostic_outcome_state')
  })

  it('TYT Sosyal alternatif varyantinda Din outcomeunu budar ve genel aggregatei okumaz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockScopeResult.mockReturnValue({
      data: {
        game: 'sosyal', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-sosyal-v1', mappingMode: 'category_proxy',
        diagnosticEnabled: false,
      },
      error: null,
    })
    mockNodeResult.mockReturnValue({ data: SOCIAL_NODES, error: null })
    mockOutcomeResult.mockReturnValue({ data: SOCIAL_OUTCOMES, error: null })
    mockIntegrityResult.mockReturnValue({
      data: {
        total: 2, mapped: 2, unmapped: 0, scopeMismatch: 0,
        nodeOrphan: 0, outcomeOrphan: 0, primaryMismatch: 0, emptyOutcome: 0,
      },
      error: null,
    })
    mockSocialContextResult.mockReturnValue({
      data: {
        status: 'active', available: true, reason: null,
        policyVersion: 'tyt-social-2026-v1',
        taxonomyVersion: 'ba-tyt-sosyal-v1',
        variant: 'questions_21_25',
        selectionEventId: SOCIAL_EVENT_ID,
        selectionEffectiveAt: '2026-08-31T08:00:00.000Z',
        allowedCategories: ['cografya', 'felsefe', 'sosyoloji', 'tarih'],
        rebuildRequired: false, legacyAggregateUsed: false,
      },
      error: null,
    })
    mockSocialStateResult.mockReturnValue({
      data: [{
        outcome_id: SOCIAL_PHILOSOPHY_OUTCOME_ID,
        attempts: 1, correct_attempts: 1,
        weighted_earned: '1.000', weighted_possible: '1.000', delayed_correct: 0,
        v2_attempts: 1, difficulty_weighted_earned: '2.000',
        difficulty_weighted_possible: '2.000', timed_attempts: 1,
        total_time_sec: '20.000', fast_wrong: 0, hinted_attempts: 0,
        hint_stage_sum: 0, guess_annotations: 0, careless_annotations: 0,
        verified_evidence_days: 1, last_answered_at: '2026-08-31T08:30:00.000Z',
      }],
      error: null,
    })

    const response = await GET(request('game=sosyal&exam_ref=TYT') as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.coverage).toMatchObject({
      supported: true, diagnosticAvailable: false,
      taxonomyVersion: 'ba-tyt-sosyal-v1',
    })
    expect(body.outcomes).toHaveLength(1)
    expect(body.outcomes[0]).toMatchObject({ code: 'SOS-FEL-01', category: 'felsefe' })
    expect(JSON.stringify(body)).not.toContain('SOS-DIN-01')
    expect(JSON.stringify(body)).not.toContain('questions_21_25')
    expect(JSON.stringify(body)).not.toContain(SOCIAL_EVENT_ID)
    expect(mockRpc).toHaveBeenCalledWith('resolve_tyt_social_mastery_read_context', {
      p_user_id: USER_ID,
    })
    expect(mockRpc).toHaveBeenCalledWith('read_tyt_social_mastery_outcome_state', {
      p_user_id: USER_ID,
    })
    expect(mockFrom).not.toHaveBeenCalledWith('user_outcome_state')
    expect(mockFrom).not.toHaveBeenCalledWith('user_diagnostic_outcome_state')
  })

  it('TYT Sosyal setup ve unavailable contextlerinde ayrinti sizdirmadan fail-closed kalir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockScopeResult.mockReturnValue({
      data: {
        game: 'sosyal', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-sosyal-v1', mappingMode: 'category_proxy',
        diagnosticEnabled: false,
      },
      error: null,
    })
    mockSocialContextResult
      .mockReturnValueOnce({
        data: {
          status: 'setup_required', available: false, reason: 'selection-required',
          policyVersion: 'tyt-social-2026-v1', taxonomyVersion: 'ba-tyt-sosyal-v1',
          variant: null, selectionEventId: null, selectionEffectiveAt: null,
          allowedCategories: [], rebuildRequired: false, legacyAggregateUsed: false,
        },
        error: null,
      })
      .mockReturnValueOnce({ data: null, error: { code: 'PGRST202' } })

    for (let index = 0; index < 2; index += 1) {
      const response = await GET(request('game=sosyal&exam_ref=TYT') as never)
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body).toEqual({
        game: 'sosyal', examRef: 'TYT',
        coverage: {
          supported: false, diagnosticAvailable: false, taxonomyVersion: null,
          totalQuestions: 0, mappedQuestions: 0, percentage: 0,
        },
        discovery: null, graph: null, outcomes: [],
      })
      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain('selection-required')
      expect(serialized).not.toContain('questions_')
      expect(serialized).not.toContain(SOCIAL_EVENT_ID)
    }
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRpc.mock.calls.filter(([name]) => (
      name === 'read_tyt_social_mastery_outcome_state'
    ))).toHaveLength(0)
  })

  it('V3 resolver exact Fen blueprintini yayinladiginda on soruluk baslangic taramasini acar', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockScopeResult.mockReturnValueOnce({
      data: {
        game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-fen-v1', mappingMode: 'category_proxy', diagnosticEnabled: true,
      },
      error: null,
    })
    mockDiagnosticScopeResult.mockReturnValueOnce({
      data: {
        game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-fen-v1', policyVersion: 'adaptive-screening-v1',
        questionCount: 10, outcomeCount: 3, maxPerOutcome: 4,
      },
      error: null,
    })
    mockNodeResult.mockReturnValueOnce({ data: FEN_NODES, error: null })
    mockOutcomeResult.mockReturnValueOnce({ data: FEN_OUTCOMES, error: null })

    const response = await GET(request('game=fen&exam_ref=TYT') as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.coverage).toMatchObject({
      supported: true,
      diagnosticAvailable: true,
      taxonomyVersion: 'ba-tyt-fen-v1',
    })
    expect(mockRpc).toHaveBeenCalledWith('resolve_released_diagnostic_scope', {
      p_game: 'fen', p_display_exam_ref: 'TYT',
    })
    expect(mockFrom).toHaveBeenCalledWith('user_diagnostic_outcome_state')
  })

  it('V3 diagnostic kapsam curriculum taxonomy ile uyusmazsa CTAyi fail-closed kapatir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockScopeResult.mockReturnValueOnce({
      data: {
        game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-fen-v1', mappingMode: 'category_proxy', diagnosticEnabled: true,
      },
      error: null,
    })
    mockDiagnosticScopeResult.mockReturnValueOnce({
      data: {
        game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-fen-v2', policyVersion: 'adaptive-screening-v1',
        questionCount: 10, outcomeCount: 3, maxPerOutcome: 4,
      },
      error: null,
    })
    mockNodeResult.mockReturnValueOnce({ data: FEN_NODES, error: null })
    mockOutcomeResult.mockReturnValueOnce({ data: FEN_OUTCOMES, error: null })

    const response = await GET(request('game=fen&exam_ref=TYT') as never)
    expect(response.status).toBe(200)
    expect((await response.json()).coverage.diagnosticAvailable).toBe(false)
    expect(mockFrom).not.toHaveBeenCalledWith('user_diagnostic_outcome_state')
  })

  it('migration oncesi eksik V3 resolver fallbackini yalniz legacy Matematik icin kullanir', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockDiagnosticScopeResult.mockReturnValueOnce({ data: null, error: { code: 'PGRST202' } })

    const response = await GET(request() as never)
    expect(response.status).toBe(200)
    expect((await response.json()).coverage.diagnosticAvailable).toBe(true)

    mockScopeResult.mockReturnValueOnce({
      data: {
        game: 'fen', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-fen-v1', mappingMode: 'category_proxy', diagnosticEnabled: true,
      },
      error: null,
    })
    mockDiagnosticScopeResult.mockReturnValueOnce({ data: null, error: { code: 'PGRST202' } })
    mockNodeResult.mockReturnValueOnce({ data: FEN_NODES, error: null })
    mockOutcomeResult.mockReturnValueOnce({ data: FEN_OUTCOMES, error: null })

    const fenResponse = await GET(request('game=fen&exam_ref=TYT') as never)
    expect(fenResponse.status).toBe(200)
    expect((await fenResponse.json()).coverage.diagnosticAvailable).toBe(false)
  })

  it('registry bayragi acik olsa bile desteklenmeyen taksonomide tanilama vaat etmez', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockScopeResult.mockReturnValueOnce({
      data: {
        game: 'matematik', displayExamRef: 'TYT', questionExamRef: 'TYT',
        taxonomyVersion: 'ba-tyt-math-v2', mappingMode: 'category_proxy', diagnosticEnabled: true,
      },
      error: null,
    })

    const response = await GET(request() as never)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.coverage).toMatchObject({
      supported: true,
      diagnosticAvailable: false,
      taxonomyVersion: 'ba-tyt-math-v2',
    })
    expect(mockFrom).not.toHaveBeenCalledWith('user_diagnostic_outcome_state')
  })

  it('coverage veya graph butunlugu bozuksa fail-closed 500 doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockIntegrityResult.mockReturnValueOnce({
      data: {
        total: 2, mapped: 1, unmapped: 1, scopeMismatch: 1,
        nodeOrphan: 0, outcomeOrphan: 0, primaryMismatch: 0, emptyOutcome: 0,
      },
      error: null,
    })
    expect((await GET(request() as never)).status).toBe(500)

    mockIntegrityResult.mockReturnValue({
      data: {
        total: 1, mapped: 1, unmapped: 0, scopeMismatch: 0,
        nodeOrphan: 0, outcomeOrphan: 0, primaryMismatch: 0, emptyOutcome: 0,
      },
      error: null,
    })
    mockNodeResult.mockReturnValueOnce({ data: NODES.slice(1), error: null })
    expect((await GET(request() as never)).status).toBe(500)
  })

  it('DB ayrintisini sizdirmeden 500 doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockOutcomeResult.mockReturnValue({
      data: null,
      error: { code: 'PGRST500', message: 'permission denied curriculum_outcomes' },
    })
    const response = await GET(request() as never)
    const body = await response.json()
    expect(response.status).toBe(500)
    expect(body.error).toBe('Sorgu basarisiz')
    expect(JSON.stringify(body)).not.toContain('permission denied')
  })

  it('IP limit auth sorgusundan once calisir', async () => {
    mockIpCheck.mockResolvedValueOnce({ success: false, retryAfter: 30 })
    const response = await GET(request() as never)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('30')
    expect(mockGetUser).not.toHaveBeenCalled()
  })

  it('auth kullanicisini user rate limit ile korur', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockUserCheck.mockResolvedValueOnce({ success: false, retryAfter: 15 })
    const response = await GET(request() as never)
    expect(response.status).toBe(429)
    expect(response.headers.get('Retry-After')).toBe('15')
    expect(mockUserCheck).toHaveBeenCalledWith(USER_ID)
  })

  it('ham cevap veya answer secen alan sorgulamaz', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    await GET(request() as never)
    const selections = mockSelect.mock.calls.map((call) => String(call[1])).join(' ')
    expect(selections).not.toMatch(/selected_option|content|answer_id|session_id|attempt_id/)
    expect(mockSelect).toHaveBeenCalledWith(
      'user_outcome_state',
      expect.stringContaining('verified_evidence_days'),
    )
    expect(mockSelect).toHaveBeenCalledWith('user_diagnostic_outcome_state', 'outcome_id')
  })
})

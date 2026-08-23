import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetUser,
  mockIpCheck,
  mockUserCheck,
  mockNodeResult,
  mockOutcomeResult,
  mockStateResult,
  mockDiagnosticResult,
  mockIntegrityResult,
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
  mockIntegrityResult: vi.fn(),
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
    rpc: mockRpc.mockImplementation(() => Promise.resolve(mockIntegrityResult())),
  })),
}))

import { GET } from '../route'

const USER_ID = '11111111-2222-3333-4444-555555555555'
const OUTCOME_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const COURSE_ID = '10000000-0000-4000-8000-000000000001'
const UNIT_ID = '10000000-0000-4000-8000-000000000002'
const TOPIC_ID = '10000000-0000-4000-8000-000000000003'
const LEAF_ID = '10000000-0000-4000-8000-000000000004'

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

function request(query = 'game=matematik&exam_ref=TYT') {
  return new Request(`http://localhost/api/profile/mastery?${query}`, {
    headers: { 'x-forwarded-for': '1.2.3.4' },
  })
}

describe('GET /api/profile/mastery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: null } })
    mockIpCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockUserCheck.mockResolvedValue({ success: true, retryAfter: 0 })
    mockNodeResult.mockReturnValue({ data: NODES, error: null })
    mockOutcomeResult.mockReturnValue({ data: OUTCOMES, error: null })
    mockStateResult.mockReturnValue({ data: [], error: null })
    mockDiagnosticResult.mockReturnValue({ data: [], error: null })
    mockIntegrityResult.mockReturnValue({
      data: { total: 1, mapped: 1, unmapped: 0, scopeMismatch: 0, nodeOrphan: 0, outcomeOrphan: 0 },
      error: null,
    })
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

  it('pilot disi scope icin sorgu yapmadan acik unsupported doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    const response = await GET(request('game=fen&exam_ref=TYT') as never)
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    await expect(response.json()).resolves.toEqual({
      game: 'fen',
      examRef: 'TYT',
      coverage: {
        supported: false,
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
    expect(mockRpc).not.toHaveBeenCalled()
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

  it('coverage veya graph butunlugu bozuksa fail-closed 500 doner', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
    mockIntegrityResult.mockReturnValueOnce({
      data: { total: 2, mapped: 1, unmapped: 1, scopeMismatch: 1, nodeOrphan: 0, outcomeOrphan: 0 },
      error: null,
    })
    expect((await GET(request() as never)).status).toBe(500)

    mockIntegrityResult.mockReturnValue({
      data: { total: 1, mapped: 1, unmapped: 0, scopeMismatch: 0, nodeOrphan: 0, outcomeOrphan: 0 },
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
    expect(mockSelect).toHaveBeenCalledWith('user_diagnostic_outcome_state', 'outcome_id')
  })
})

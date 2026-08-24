import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockContentRpc, mockGetUser, mockRateCheck } = vi.hoisted(() => ({
  mockContentRpc: vi.fn(),
  mockGetUser: vi.fn(),
  mockRateCheck: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: vi.fn(() => ({})) }))
vi.mock('@/lib/content-governance/route-context', () => ({ contentRpc: mockContentRpc }))
vi.mock('@/lib/content-governance/server-security', () => ({ contentGovernanceEnabled: vi.fn(() => true) }))
vi.mock('@/lib/question-quality/server-risk', () => ({ questionQualityIndependenceKey: vi.fn(() => 'a'.repeat(64)) }))
vi.mock('@/lib/utils/rate-limit', () => ({ createRateLimiter: vi.fn(() => ({ check: mockRateCheck })) }))

import { POST, PUT } from '../route'

const MISSION_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const REQUEST_ID = 'bbbbbbbb-0000-4000-8000-000000000002'

function request(body: unknown) {
  return new Request('http://localhost/api/questions/quality-missions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/questions/quality-missions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRateCheck.mockResolvedValue({ success: true })
    mockContentRpc.mockResolvedValue({ data: { status: 'submitted' }, error: null })
  })

  it('persists the locked answer separately from the proposed correction', async () => {
    const response = (await POST(request({
      missionId: MISSION_ID,
      selectedAnswerIndex: 1,
      verdict: 'flawed',
      reasonCode: 'wrong_key',
      proposedAnswerIndex: 3,
      explanation: 'Bağımsız çözümüm anahtarın farklı olması gerektiğini gösteriyor.',
      confidence: 90,
      requestId: REQUEST_ID,
    })))!

    expect(response.status).toBe(200)
    expect(mockContentRpc).toHaveBeenCalledWith(expect.anything(), 'submit_assigned_question_quality_mission', expect.objectContaining({
      p_selected_answer_index: 1,
      p_proposed_answer_index: 3,
    }))
  })

  it('rejects a submission without a locked answer before calling the RPC', async () => {
    const response = (await POST(request({
      missionId: MISSION_ID,
      verdict: 'clean',
      confidence: 70,
      requestId: REQUEST_ID,
    })))!

    expect(response.status).toBe(400)
    expect(mockContentRpc).not.toHaveBeenCalled()
  })
})

describe('PUT /api/questions/quality-missions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockRateCheck.mockResolvedValue({ success: true })
    mockContentRpc.mockResolvedValue({ data: { status: 'answer_locked' }, error: null })
  })

  it('locks the answer through the owner-bound RPC', async () => {
    const response = (await PUT(request({
      missionId: MISSION_ID,
      selectedAnswerIndex: 2,
      requestId: REQUEST_ID,
    })))!

    expect(response.status).toBe(200)
    expect(mockContentRpc).toHaveBeenCalledWith(expect.anything(), 'lock_question_quality_mission_answer', {
      p_user_id: 'user-1',
      p_mission_id: MISSION_ID,
      p_selected_answer_index: 2,
      p_request_id: REQUEST_ID,
    })
  })

  it('rejects an out-of-range answer before calling the RPC', async () => {
    const response = (await PUT(request({ missionId: MISSION_ID, selectedAnswerIndex: 5, requestId: REQUEST_ID })))!
    expect(response.status).toBe(400)
    expect(mockContentRpc).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  limiter: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('@/lib/utils/rate-limit', () => ({
  createRateLimiter: () => ({ check: mocks.limiter }),
}))

import { GET } from '../route'

const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('account data export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.limiter.mockResolvedValue({ success: true })
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          email: 'user@example.com',
          created_at: '2026-01-01T00:00:00.000Z',
          last_sign_in_at: '2026-08-24T00:00:00.000Z',
        },
      },
    })
  })

  it('uses the catalog-driven RPC and returns its complete table map', async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        tables: {
          verified_attempts: [{ id: 'attempt-1', user_id: USER_ID }],
          review_cards: [{ user_id: USER_ID, question_id: 'question-1' }],
          review_logs: [{ id: 'review-1', user_id: USER_ID }],
          teacher_assignment_submissions: [{ id: 'submission-1', student_id: USER_ID }],
          teacher_assignment_submission_items: [{ submission_id: 'submission-1', position: 1 }],
        },
        coverage: {
          directSubjectColumns: true,
          relatedTables: ['session_answers', 'teacher_assignment_submission_items'],
        },
      },
      error: null,
    })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('export_account_data', { p_user_id: USER_ID })
    expect(body.schemaVersion).toBe('bilge-arena-dsar-v2')
    expect(body.data).toHaveProperty('verified_attempts')
    expect(body.data).toHaveProperty('review_cards')
    expect(body.data).toHaveProperty('teacher_assignment_submission_items')
  })

  it('fails closed when the catalog export contract is incomplete', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.rpc.mockResolvedValue({ data: { tables: {} }, error: null })

    const response = await GET()

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    consoleError.mockRestore()
  })
})

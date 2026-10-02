import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { replaySocialPilotSession } from '@/lib/diagnostic/social-pilot-session'
import { SOCIAL_PILOT_CATEGORIES } from '@/lib/diagnostic/social-pilot'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getUser: vi.fn(), limit: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => ({ rpc: mocks.rpc }) }))
vi.mock('@/lib/utils/rate-limit', () => ({ createRateLimiter: () => ({ check: mocks.limit }) }))
import { GET, POST } from '../route'

const user = randomUUID()
function snapshot() {
  const rows = SOCIAL_PILOT_CATEGORIES.flatMap((category, ci) => [1, 2, 3, 3, 4, 5].map((difficulty, i) => ({
    id: randomUUID(), published_revision_id: randomUUID(), content_sha256: (ci * 6 + i + 1).toString(16).padStart(64, '0'),
    game: 'sosyal' as const, exam_ref: 'TYT' as const, category, difficulty,
    content: { question: 'Örnek?', options: ['A', 'B', 'C', 'D', 'E'], answer: 1, solution: 'secret_solution' },
  })))
  const id = randomUUID()
  const first = replaySocialPilotSession({ rows, seed: id, responses: [] }).nextQuestion!
  return { enabled: true, packId: randomUUID(), rows,
    session: { id, status: 'active', expiresAt: '2099-09-30T12:00:00Z', answeredCount: 0,
      currentQuestionId: first.questionId, rows, responses: [] } }
}
function post(body: unknown) {
  return POST(new NextRequest('https://example.test/api/study/diagnostic/social-pilot', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }))
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: user } }, error: null })
  mocks.limit.mockResolvedValue({ success: true })
})
describe('social pilot HTTP boundary', () => {
  it('requires authentication before accessing snapshots', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    expect((await GET(new NextRequest('https://example.test'))).status).toBe(401)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('fails closed when the rate limiter is unavailable', async () => {
    mocks.limit.mockResolvedValue({ success: false, reason: 'backend_unavailable' })
    expect((await GET(new NextRequest('https://example.test'))).status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('uses the authenticated owner and never serializes private snapshot contents', async () => {
    mocks.rpc.mockResolvedValue({ data: snapshot(), error: null })
    const response = await GET(new NextRequest('https://example.test?userId=forged'))
    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(mocks.rpc).toHaveBeenCalledWith('get_social_discovery_pilot_context', { p_user_id: user, p_session_id: null })
    expect(await response.text()).not.toContain('secret_solution')
  })
  it('rejects client-supplied correctness or user identity', async () => {
    expect((await post({ action: 'start', userId: randomUUID() })).status).toBe(400)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('does not start an unpublished pack', async () => {
    mocks.rpc.mockResolvedValue({ data: { enabled: false, packId: null, rows: [], session: null }, error: null })
    const response = await post({ action: 'start' })
    expect(await response.json()).toMatchObject({ supported: false })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('refuses out-of-order questions before recording any answer', async () => {
    const current = snapshot()
    mocks.rpc.mockResolvedValue({ data: current, error: null })
    expect((await post({ action: 'answer', sessionId: current.session.id, questionId: randomUUID(),
      selectedOption: 0, responseTimeMs: 1000, requestId: randomUUID() })).status).toBe(409)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
  it('derives the next question server-side and supplies a progress compare-and-swap token', async () => {
    const current = snapshot()
    const row = current.rows.find(row => row.id === current.session.currentQuestionId)!
    const responses = [{ questionId: row.id, revisionId: row.published_revision_id,
      contentSha256: row.content_sha256, selectedOptionIndex: 1 }]
    const next = replaySocialPilotSession({ rows: current.rows, seed: current.session.id, responses }).nextQuestion!
    const updated = { ...current, session: { ...current.session, responses, answeredCount: 1,
      currentQuestionId: next.questionId } }
    mocks.rpc.mockResolvedValueOnce({ data: current, error: null })
      .mockResolvedValueOnce({ data: updated, error: null })
    const requestId = randomUUID()
    const response = await post({ action: 'answer', sessionId: current.session.id,
      questionId: current.session.currentQuestionId, selectedOption: 1, responseTimeMs: 1000, requestId })
    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenLastCalledWith('record_social_discovery_pilot_answer', expect.objectContaining({
      p_user_id: user, p_session_id: current.session.id, p_question_id: current.session.currentQuestionId,
      p_selected_option: 1, p_request_id: requestId, p_expected_answered_count: 0,
      p_next_question_id: expect.any(String),
    }))
  })
  it('maps a database concurrency conflict to a retryable public response', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'private detail' } })
    const response = await post({ action: 'start' })
    expect(response.status).toBe(409)
    expect(await response.text()).not.toContain('private detail')
  })
  it('does not reveal another owner or database permission detail', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'owner mismatch' } })
    const response = await post({ action: 'start' })
    expect(response.status).toBe(404)
    expect(await response.text()).not.toContain('owner mismatch')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn() }))
vi.mock('@/lib/content-governance/route-context', () => ({
  requireContentGovernanceContext: mocks.context,
  contentRpc: vi.fn(),
}))

import { GET } from '../validation/route'
import { QUESTION_QUALITY_POLICY_VERSION } from '@/lib/question-audit/orchestrator'

const USER = '11111111-1111-4111-8111-111111111111'
const QID = '22222222-2222-4222-8222-222222222222'

/** Supabase query builder'inin zincirini taklit eder; son await'te sonucu doner. */
function fakeAdmin(rows: unknown[], count = rows.length) {
  const calls: Record<string, unknown[]> = { eq: [], order: [], range: [], select: [] }
  const builder: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'range']) {
    builder[m] = (...args: unknown[]) => { calls[m].push(args); return builder }
  }
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null, count })
  return { admin: { from: () => builder }, calls }
}

const row = (over: Record<string, unknown> = {}) => ({
  question_id: QID,
  verdict: 'NEEDS_REVIEW',
  policy_version: QUESTION_QUALITY_POLICY_VERSION,
  rationale: 'AMBIGUOUS_WORDING(advisory)',
  findings: [{ code: 'AMBIGUOUS_WORDING', evidence: 'iki okuma mumkun', optionIndexes: [1, 2] }],
  blind_agreement_ratio: 0.6666666666666666,
  decided_at: '2026-08-21T20:00:00.000Z',
  questions: { game: 'matematik', category: 'geometri', is_active: true },
  ...over,
})

const req = (qs: string) => new Request(`http://localhost/api/admin/content-quality/validation?${qs}`)

beforeEach(() => { vi.clearAllMocks() })

describe('yetki ve dogrulama', () => {
  it('yetkisiz istek context yanitini aynen doner', async () => {
    const denied = new Response('nope', { status: 403 })
    mocks.context.mockResolvedValue({ ok: false, response: denied })
    expect(await GET(req('verdict=NEEDS_REVIEW'))).toBe(denied)
  })

  it('gecersiz verdict 400', async () => {
    mocks.context.mockResolvedValue({ ok: true, userId: USER, admin: {} })
    expect((await GET(req('verdict=BILINMEYEN'))).status).toBe(400)
  })

  it('verdict zorunlu', async () => {
    mocks.context.mockResolvedValue({ ok: true, userId: USER, admin: {} })
    expect((await GET(req('limit=10'))).status).toBe(400)
  })

  it('bilinmeyen parametre reddedilir (strict)', async () => {
    mocks.context.mockResolvedValue({ ok: true, userId: USER, admin: {} })
    expect((await GET(req('verdict=APPROVED&hepsi=1'))).status).toBe(400)
  })
})

describe('listeleme', () => {
  it('verdict ve GUNCEL policy surumune gore filtreler', async () => {
    const { admin, calls } = fakeAdmin([row()])
    mocks.context.mockResolvedValue({ ok: true, userId: USER, admin })
    const res = await GET(req('verdict=NEEDS_REVIEW'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.total).toBe(1)
    expect(body.policyVersion).toBe(QUESTION_QUALITY_POLICY_VERSION)
    expect(calls.eq).toEqual(
      expect.arrayContaining([['verdict', 'NEEDS_REVIEW'], ['policy_version', QUESTION_QUALITY_POLICY_VERSION]]),
    )
  })

  it('soru bilgisini ve bulgulari duzlestirir', async () => {
    const { admin } = fakeAdmin([row()])
    mocks.context.mockResolvedValue({ ok: true, userId: USER, admin })
    const [item] = (await (await GET(req('verdict=NEEDS_REVIEW'))).json()).items
    expect(item).toMatchObject({
      questionId: QID, verdict: 'NEEDS_REVIEW', game: 'matematik', category: 'geometri', isActive: true,
      findingCodes: ['AMBIGUOUS_WORDING'],
    })
    expect(item.findings[0].evidence).toContain('iki okuma')
    expect(item.blindAgreementRatio).toBeCloseTo(2 / 3)
  })

  /** Ham model ciktisi reviewer'a gitmemeli; yalniz tiplenmis bulgu + gerekce. */
  it('ham model ciktisi ve model kimligi sizmaz', async () => {
    const { admin } = fakeAdmin([row({ raw_output: 'GIZLI-HAM-CIKTI', model_id: 'gemini-x' })])
    mocks.context.mockResolvedValue({ ok: true, userId: USER, admin })
    const text = await (await GET(req('verdict=NEEDS_REVIEW'))).text()
    expect(text).not.toContain('GIZLI-HAM-CIKTI')
    expect(text).not.toContain('gemini-x')
  })

  it('aktiflik filtresi sorgulara eklenir', async () => {
    const { admin, calls } = fakeAdmin([])
    mocks.context.mockResolvedValue({ ok: true, userId: USER, admin })
    await GET(req('verdict=REJECTED&activeOnly=true'))
    expect(calls.select[0]?.[0]).toContain('questions!inner(')
    expect(calls.eq).toEqual(expect.arrayContaining([['questions.is_active', true]]))
  })

  it('eski policy surumu acikca istenebilir', async () => {
    const { admin, calls } = fakeAdmin([])
    mocks.context.mockResolvedValue({ ok: true, userId: USER, admin })
    await GET(req('verdict=APPROVED&policyVersion=question-quality%401'))
    expect(calls.eq).toEqual(expect.arrayContaining([['policy_version', 'question-quality@1']]))
  })

  it('sayfalama range olarak gecer', async () => {
    const { admin, calls } = fakeAdmin([])
    mocks.context.mockResolvedValue({ ok: true, userId: USER, admin })
    await GET(req('verdict=NEEDS_REVIEW&limit=25&offset=50'))
    expect(calls.range).toEqual([[50, 74]])
  })

  // Kararlar questions FK'sine ON DELETE CASCADE ile bagli; inner join hem bu
  // invarianti yansitir hem de activeOnly filtresinin ust satirlari elemesini
  // garanti eder.
})

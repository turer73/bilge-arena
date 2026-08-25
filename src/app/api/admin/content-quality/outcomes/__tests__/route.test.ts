import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ context: vi.fn(), from: vi.fn() }))
vi.mock('@/lib/content-governance/route-context', () => ({
  requireContentGovernanceContext: mocks.context,
}))

import { GET } from '../route'

const OUTCOME = '11111111-1111-4111-8111-111111111111'

function outcomeBuilder() {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.is = vi.fn(() => chain)
  chain.order = vi.fn(() => chain)
  chain.limit = vi.fn(async () => ({
    data: [
      { id: OUTCOME, code: 'FEN-FIZ-01', title: 'Fiziksel akıl yürütme', game: 'fen', category: 'fizik', exam_ref: 'TYT', node_id: 'node-1', taxonomy_version: 'ba-tyt-fen-v1', is_active: true },
      { id: '22222222-2222-4222-8222-222222222222', code: 'OLD', title: 'Pasif leaf', game: 'fen', category: 'fizik', exam_ref: 'TYT', node_id: 'node-old', taxonomy_version: 'old-v1', is_active: true },
    ],
    error: null,
  }))
  return chain
}

function nodeBuilder() {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.in = vi.fn(async (_column: string, ids: string[]) => ({ data: [
    { id: 'node-1', code: 'OUT', title: 'Kazanım', game: 'fen', category: 'fizik', exam_ref: 'TYT', parent_id: 'node-topic', node_type: 'outcome', taxonomy_version: 'ba-tyt-fen-v1', is_active: true },
    { id: 'node-topic', code: 'TOP', title: 'Konu', game: 'fen', category: 'fizik', exam_ref: 'TYT', parent_id: 'node-unit', node_type: 'topic', taxonomy_version: 'ba-tyt-fen-v1', is_active: true },
    { id: 'node-unit', code: 'UNIT', title: 'Ünite', game: 'fen', category: null, exam_ref: 'TYT', parent_id: 'node-course', node_type: 'unit', taxonomy_version: 'ba-tyt-fen-v1', is_active: true },
    { id: 'node-course', code: 'COURSE', title: 'Ders', game: 'fen', category: null, exam_ref: 'TYT', parent_id: null, node_type: 'course', taxonomy_version: 'ba-tyt-fen-v1', is_active: true },
  ].filter((node) => ids.includes(node.id)), error: null }))
  return chain
}

describe('GET content-quality/outcomes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const outcomes = outcomeBuilder()
    const nodes = nodeBuilder()
    mocks.from.mockImplementation((table: string) => table === 'curriculum_outcomes' ? outcomes : nodes)
    mocks.context.mockResolvedValue({ ok: true, userId: 'admin-1', admin: { from: mocks.from } })
  })

  it('returns only active taxonomy leaves in the requested exact exam scope', async () => {
    const response = await GET(new Request('http://localhost/api/admin/content-quality/outcomes?game=fen&category=fizik&examRef=TYT'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ outcomes: [{
      id: OUTCOME,
      code: 'FEN-FIZ-01',
      title: 'Fiziksel akıl yürütme',
      category: 'fizik',
      examRef: 'TYT',
      taxonomyVersion: 'ba-tyt-fen-v1',
    }] })
    const outcomeChain = mocks.from.mock.results[0]?.value as { eq: ReturnType<typeof vi.fn> }
    expect(outcomeChain.eq).toHaveBeenCalledWith('exam_ref', 'TYT')
  })

  it('rejects unknown exam scopes before touching the database', async () => {
    const response = await GET(new Request('http://localhost/api/admin/content-quality/outcomes?game=fen&category=fizik&examRef=YKS'))
    expect(response.status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('uses an exact NULL exam filter for an explicitly general revision scope', async () => {
    const response = await GET(new Request('http://localhost/api/admin/content-quality/outcomes?game=fen&category=fizik&scope=general'))

    expect(response.status).toBe(200)
    const outcomeChain = mocks.from.mock.results[0]?.value as { is: ReturnType<typeof vi.fn> }
    expect(outcomeChain.is).toHaveBeenCalledWith('exam_ref', null)
  })

  it('rejects mixing a named exam with the general scope', async () => {
    const response = await GET(new Request('http://localhost/api/admin/content-quality/outcomes?game=fen&category=fizik&examRef=TYT&scope=general'))
    expect(response.status).toBe(400)
    expect(mocks.from).not.toHaveBeenCalled()
  })
})

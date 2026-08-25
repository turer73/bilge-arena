import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../route-context', () => ({ contentRpc: mocks.rpc }))

import { createGovernedQuestionDraft } from '../question-drafts'

const ACTOR = '11111111-1111-4111-8111-111111111111'
const REQUEST = '22222222-2222-4222-8222-222222222222'
const OUTCOME = '33333333-3333-4333-8333-333333333333'
const QUESTION = '44444444-4444-4444-8444-444444444444'
const REVISION = '55555555-5555-4555-8555-555555555555'

function builder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn(() => chain)
  chain.eq = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(async () => result)
  return chain
}

function adminClient(
  outcome: Record<string, unknown> | null,
  node: Record<string, unknown> | null,
) {
  const nodes = node ? [
    { ...node, id: 'node-1', code: 'OUT', title: 'Kazanım', parent_id: 'node-topic', node_type: 'outcome' },
    { ...node, id: 'node-topic', code: 'TOP', title: 'Konu', parent_id: 'node-unit', node_type: 'topic', category: 'sayilar' },
    { ...node, id: 'node-unit', code: 'UNIT', title: 'Ünite', parent_id: 'node-course', node_type: 'unit', category: null },
    { ...node, id: 'node-course', code: 'COURSE', title: 'Ders', parent_id: null, node_type: 'course', category: null },
  ] : []
  return {
    from: vi.fn((table: string) => {
      if (table === 'curriculum_outcomes') return builder({ data: outcome, error: null })
      const chain: Record<string, unknown> = {}
      chain.select = vi.fn(() => chain)
      chain.in = vi.fn(async (_column: string, ids: string[]) => ({
        data: nodes.filter((candidate) => ids.includes(candidate.id)), error: null,
      }))
      return chain
    }),
  }
}

function input(metadata: Record<string, unknown> = {}) {
  return {
    actorId: ACTOR,
    requestId: REQUEST,
    content: { question: '2+2?', options: ['3', '4'], answer: 1 },
    metadata: { game: 'matematik', category: 'sayilar', difficulty: 2, ...metadata },
    outcomeId: OUTCOME,
    source: { kind: 'original' as const, title: 'İç kaynak', licenseCode: 'INTERNAL' },
    summary: 'İnceleme taslağı.',
  }
}

describe('createGovernedQuestionDraft outcome scope', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.rpc.mockResolvedValue({
      data: { questionId: QUESTION, revisionId: REVISION, revisionNo: 1, status: 'draft', replayed: false },
      error: null,
    })
  })

  it('derives examRef from the active exact-scope outcome instead of trusting the client', async () => {
    const admin = adminClient(
      { id: OUTCOME, game: 'matematik', category: 'sayilar', exam_ref: 'TYT', is_active: true, node_id: 'node-1', taxonomy_version: 'ba-tyt-math-v1' },
      { is_active: true, node_type: 'outcome', game: 'matematik', category: 'sayilar', exam_ref: 'TYT', taxonomy_version: 'ba-tyt-math-v1' },
    )

    const result = await createGovernedQuestionDraft(admin as never, input())

    expect(result.error).toBeNull()
    expect(mocks.rpc).toHaveBeenCalledWith(admin, 'create_governed_question', expect.objectContaining({
      p_payload: expect.objectContaining({
        metadata: expect.objectContaining({ game: 'matematik', category: 'sayilar', examRef: 'TYT' }),
      }),
    }))
  })

  it('rejects a cross-category outcome before calling the governance RPC', async () => {
    const admin = adminClient(
      { id: OUTCOME, game: 'matematik', category: 'geometri', exam_ref: 'TYT', is_active: true, node_id: 'node-1', taxonomy_version: 'ba-tyt-math-v1' },
      { is_active: true, node_type: 'outcome', game: 'matematik', category: 'geometri', exam_ref: 'TYT', taxonomy_version: 'ba-tyt-math-v1' },
    )

    const result = await createGovernedQuestionDraft(admin as never, input())

    expect(result).toEqual({ data: null, error: { code: '22023' } })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects an inactive curriculum leaf and a forged examRef', async () => {
    const inactiveAdmin = adminClient(
      { id: OUTCOME, game: 'matematik', category: 'sayilar', exam_ref: 'TYT', is_active: true, node_id: 'node-1', taxonomy_version: 'ba-tyt-math-v1' },
      { is_active: false, node_type: 'outcome', game: 'matematik', category: 'sayilar', exam_ref: 'TYT', taxonomy_version: 'ba-tyt-math-v1' },
    )
    expect(await createGovernedQuestionDraft(inactiveAdmin as never, input())).toEqual({ data: null, error: { code: '22023' } })

    const activeAdmin = adminClient(
      { id: OUTCOME, game: 'matematik', category: 'sayilar', exam_ref: 'TYT', is_active: true, node_id: 'node-1', taxonomy_version: 'ba-tyt-math-v1' },
      { is_active: true, node_type: 'outcome', game: 'matematik', category: 'sayilar', exam_ref: 'TYT', taxonomy_version: 'ba-tyt-math-v1' },
    )
    expect(await createGovernedQuestionDraft(activeAdmin as never, input({ examRef: 'LGS' }))).toEqual({ data: null, error: { code: '22023' } })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
})

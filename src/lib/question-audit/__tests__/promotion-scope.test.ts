import { describe, expect, it, vi } from 'vitest'
import { assertPromotionScope, loadPromotionTargetRows, type PromotionContext, type PromotionScope } from '../promotion-scope'
import type { QuestionRow } from '../question-source'

const scope: PromotionScope = {
  schemaVersion: 'promotion-scope@1', kind: 'bounded_cohort', game: 'turkce', examRef: 'LGS',
  controlSetSha256: 'a'.repeat(64),
  targets: [1, 2].map(n => ({
    questionId: `${n}1111111-1111-4111-8111-111111111111`,
    revisionId: `${n}2222222-2222-4222-8222-222222222222`, contentSha256: String(n).repeat(64),
  })),
}
const context = (): PromotionContext => ({
  controlSetSha256: scope.controlSetSha256,
  targets: scope.targets.map(t => ({ ...t, game: scope.game, examRef: scope.examRef })),
})

describe('pinned cohort selection', () => {
  const rows = (): QuestionRow[] => scope.targets.map(t => ({ id: t.questionId,
    published_revision_id: t.revisionId, content_sha256: t.contentSha256,
    game: scope.game, exam_ref: scope.examRef, category: 'paragraf', content: {} }))
  it('selects exact revision IDs and restores frozen order', async () => {
    const read = vi.fn(async () => rows().reverse())
    expect(await loadPromotionTargetRows(scope, read)).toEqual(rows())
    expect(read).toHaveBeenCalledExactlyOnceWith(scope.targets.map(t => t.revisionId))
  })
  it('rejects duplicate pins before even reading the database', async () => {
    const read = vi.fn()
    await expect(loadPromotionTargetRows({ ...scope, targets: [scope.targets[0], scope.targets[0]] }, read)).rejects.toThrow('yinelenen')
    expect(read).not.toHaveBeenCalled()
  })
  it.each(['missing', 'duplicate', 'revision', 'hash', 'game', 'exam'])('rejects %s live drift', async failure => {
    const values = rows()
    if (failure === 'missing') values.pop()
    if (failure === 'duplicate') values[1] = values[0]
    if (failure === 'revision') values[0].published_revision_id = scope.targets[1].revisionId
    if (failure === 'hash') values[0].content_sha256 = 'f'.repeat(64)
    if (failure === 'game') values[0].game = 'fen'
    if (failure === 'exam') values[0].exam_ref = 'TYT'
    await expect(loadPromotionTargetRows(scope, async () => values)).rejects.toThrow('terfi kapsami')
  })
})

describe('exact bounded promotion scope', () => {
  it('accepts the same cohort independent of ordering', () => {
    const ctx = context(); ctx.targets = [...ctx.targets].reverse()
    expect(() => assertPromotionScope(scope, ctx)).not.toThrow()
  })
  it.each([undefined, null, {}, { ...scope, kind: 'general_model' }, { ...scope, schemaVersion: 'promotion-scope@0' }])(
    'rejects legacy/unvalidated general scope %j', bad => {
      expect(() => assertPromotionScope(bad, context())).toThrow('terfi kapsami')
    },
  )
  it.each(['game', 'examRef', 'questionId', 'revisionId', 'contentSha256'] as const)(
    'rejects target %s drift', field => {
      const ctx = context(); ctx.targets = [{ ...ctx.targets[0], [field]: 'different' }, ctx.targets[1]]
      expect(() => assertPromotionScope(scope, ctx)).toThrow('terfi kapsami')
    },
  )
  it.each(['', 'b'.repeat(64)])('rejects different/missing controls %s', hash => {
    expect(() => assertPromotionScope(scope, { ...context(), controlSetSha256: hash })).toThrow('kontrol kumesi')
  })
  it.each(['empty', 'subset', 'extra', 'duplicate'] as const)('rejects %s target cohort', kind => {
    const ctx = context()
    ctx.targets = kind === 'empty' ? [] : kind === 'subset' ? ctx.targets.slice(0, 1)
      : kind === 'extra' ? [...ctx.targets, ctx.targets[0]] : [ctx.targets[0], ctx.targets[0]]
    expect(() => assertPromotionScope(scope, ctx)).toThrow('terfi kapsami')
  })
  it('rejects duplicate question and revision in the evidence itself', () => {
    expect(() => assertPromotionScope({ ...scope, targets: [scope.targets[0], scope.targets[0]] }, context())).toThrow('yinelenen')
    expect(() => assertPromotionScope({ ...scope, targets: [scope.targets[0], { ...scope.targets[1], revisionId: scope.targets[0].revisionId }] }, context())).toThrow('yinelenen')
  })
  it('does not reuse a Fen cohort with identical target pins for Turkish', () => {
    expect(() => assertPromotionScope({ ...scope, game: 'fen' }, context())).toThrow('ders veya sinav')
  })
})

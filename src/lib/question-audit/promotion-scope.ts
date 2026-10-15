import { z } from 'zod'
import type { QuestionRow } from './question-source'

const sha256 = z.string().regex(/^[a-f0-9]{64}$/)
const uuid = z.uuid().regex(/^[a-f0-9-]+$/)
const pin = z.strictObject({
  questionId: uuid,
  revisionId: uuid,
  contentSha256: sha256,
})

/** Only bounded cohorts are supported. General model/domain promotion needs
 * separately validated distribution evidence; a free-text label is not enough.
 * Legacy reports must not be silently upgraded to this contract. */
export const promotionScopeSchema = z.strictObject({
  schemaVersion: z.literal('promotion-scope@1'),
  kind: z.literal('bounded_cohort'),
  game: z.string().trim().min(1),
  examRef: z.string().trim().min(1),
  controlSetSha256: sha256,
  targets: z.array(pin).min(1),
})

export type PromotionScope = z.infer<typeof promotionScopeSchema>
export interface PromotionTarget extends z.infer<typeof pin> {
  game: string
  examRef: string
}
export interface PromotionContext {
  /** Hash of the independently supplied frozen control artifact, not copied
   * from the promotion report. This binds evidence, not its truth/authorship. */
  controlSetSha256: string
  targets: readonly PromotionTarget[]
}

export function assertPromotionScope(scope: unknown, context: PromotionContext): asserts scope is PromotionScope {
  const parsed = promotionScopeSchema.safeParse(scope)
  if (!parsed.success) throw new Error('terfi kapsami eksik veya gecersiz; eski/genel rapor otomatik tasinamaz')
  const expected = parsed.data
  if (!context || !sha256.safeParse(context.controlSetSha256).success ||
      expected.controlSetSha256 !== context.controlSetSha256) {
    throw new Error('terfi kapsami kontrol kumesiyle uyusmuyor')
  }
  if (!Array.isArray(context.targets) || context.targets.length !== expected.targets.length) {
    throw new Error('terfi kapsami tam hedef kumesiyle uyusmuyor')
  }
  const unique = (targets: readonly z.infer<typeof pin>[]) => {
    if (new Set(targets.map(t => t.questionId)).size !== targets.length ||
        new Set(targets.map(t => t.revisionId)).size !== targets.length) {
      throw new Error('terfi kapsami yinelenen soru veya revizyon tasiyor')
    }
  }
  unique(expected.targets)
  unique(context.targets)
  const byQuestion = new Map(expected.targets.map(t => [t.questionId, t]))
  for (const target of context.targets) {
    if (target.game !== expected.game || target.examRef !== expected.examRef) {
      throw new Error('terfi kapsami ders veya sinavla uyusmuyor')
    }
    const actual = pin.safeParse({
      questionId: target.questionId, revisionId: target.revisionId, contentSha256: target.contentSha256,
    })
    const authorized = byQuestion.get(target.questionId)
    if (!actual.success || !authorized || authorized.revisionId !== target.revisionId ||
        authorized.contentSha256 !== target.contentSha256) {
      throw new Error('terfi kapsami soru/revizyon/hash ile uyusmuyor')
    }
  }
}

/** Read exact draft revisions, never replace them with published pointers or
 * another revision having the same text. This is selection, not permission. */
export async function loadPromotionTargetRows(
  input: unknown,
  read: (revisionIds: string[]) => Promise<QuestionRow[]>,
): Promise<QuestionRow[]> {
  const scope = promotionScopeSchema.parse(input)
  assertPromotionScope(scope, {
    controlSetSha256: scope.controlSetSha256,
    targets: scope.targets.map(t => ({ ...t, game: scope.game, examRef: scope.examRef })),
  })
  const rows: QuestionRow[] = []
  for (let offset = 0; offset < scope.targets.length; offset += 100) {
    rows.push(...await read(scope.targets.slice(offset, offset + 100).map(t => t.revisionId)))
  }
  assertPromotionScope(scope, {
    controlSetSha256: scope.controlSetSha256,
    targets: rows.map(row => ({ questionId: row.id, revisionId: row.published_revision_id ?? '',
      contentSha256: row.content_sha256 ?? '', game: row.game, examRef: row.exam_ref ?? '' })),
  })
  const byRevision = new Map(rows.map(row => [row.published_revision_id, row]))
  return scope.targets.map(t => byRevision.get(t.revisionId)!)
}

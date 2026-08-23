import { describe, expect, it } from 'vitest'
import { buildHumanGoldSet, findHumanGoldDisputes, type ExpertReviewFile } from '../gold-set'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const C = 'c'.repeat(64)
const HASH = 'd'.repeat(64)

function review(reviewerRef: string, flawCodes: ExpertReviewFile['labels'][number]['flawCodes']): ExpertReviewFile {
  return {
    schemaVersion: 'question-audit-review@1', reviewerRef, role: 'reviewer',
    labels: [{ questionId: 'q1', contentSha256: HASH, flawCodes }],
  }
}

describe('buildHumanGoldSet', () => {
  it('iki ayni kor etiketi consensus gold kaydina donusturur', () => {
    expect(buildHumanGoldSet([review(A, []), review(B, [])])).toEqual([{
      questionId: 'q1', contentSha256: HASH, flawCodes: [], reviewerCount: 2,
      adjudication: 'consensus', reviewerRefs: [A, B],
    }])
  })

  it('ayrismayi ucuncu ve farkli uzman olmadan kapatmaz', () => {
    expect(() => buildHumanGoldSet([
      review(A, []), review(B, ['WRONG_KEY_SUSPECTED']),
    ])).toThrow('adjudicator')
  })

  it('ucuncu uzmanın nihai kusur kodunu adjudicated olarak kaydeder', () => {
    const adjudicator: ExpertReviewFile = {
      schemaVersion: 'question-audit-review@1', reviewerRef: C, role: 'adjudicator',
      labels: [{ questionId: 'q1', contentSha256: HASH, flawCodes: ['WRONG_KEY_SUSPECTED'] }],
    }
    expect(buildHumanGoldSet([
      review(A, []), review(B, ['WRONG_KEY_SUSPECTED']), adjudicator,
    ])[0]).toMatchObject({
      flawCodes: ['WRONG_KEY_SUSPECTED'], reviewerCount: 3,
      adjudication: 'adjudicated', reviewerRefs: [A, B, C],
    })
  })

  it('ayni kisinin iki rol almasini reddeder', () => {
    expect(() => buildHumanGoldSet([review(A, []), review(A.toUpperCase(), [])])).toThrow('referanslari farkli')
  })

  it('bir uzmanın ayni soru icin iki revision etiketlemesini reddeder', () => {
    const first = review(A, [])
    first.labels.push({ ...first.labels[0], contentSha256: 'f'.repeat(64) })
    expect(() => buildHumanGoldSet([first, review(B, [])])).toThrow('yalniz bir revizyon')
  })

  it('yalniz farkli etiketlenen maddeleri adjudication listesine alir', () => {
    const left = review(A, [])
    const right = review(B, ['WRONG_KEY_SUSPECTED'])
    expect(findHumanGoldDisputes([left, right])).toEqual([{
      questionId: 'q1',
      contentSha256: HASH,
      reviewerFlawCodes: [[], ['WRONG_KEY_SUSPECTED']],
    }])
    expect(findHumanGoldDisputes([left, review(B, [])])).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { selectBlindReviewSet, toBlindReviewPacket, type ReviewCandidate, type ReviewGame } from '../review-pack'

function candidate(game: ReviewGame, verdict: ReviewCandidate['verdict'], index: number): ReviewCandidate {
  return {
    questionId: `${game}-${verdict}-${index}`,
    revisionId: `revision-${game}-${verdict}-${index}`,
    contentSha256: index.toString(16).padStart(64, '0'),
    game,
    category: `category-${index % 3}`,
    subcategory: null,
    topic: `topic-${index % 4}`,
    examRef: index % 2 ? 'TYT' : 'LGS',
    difficulty: (index % 5) + 1,
    content: { question: `soru ${index}`, options: ['a', 'b', 'c', 'd'], answer: 1 },
    verdict,
  }
}

describe('blind human review selection', () => {
  const candidates = (['matematik', 'turkce'] as const).flatMap((game) => [
    ...Array.from({ length: 12 }, (_, index) => candidate(game, 'APPROVED', index + 1)),
    ...Array.from({ length: 12 }, (_, index) => candidate(game, 'NEEDS_REVIEW', index + 20)),
  ])

  it('her alanda approved ve flagged kotalarini deterministik secer', () => {
    const first = selectBlindReviewSet(candidates, { seed: 'gold-v1', games: ['matematik', 'turkce'], perGame: 10, flaggedPerGame: 4 })
    const second = selectBlindReviewSet([...candidates].reverse(), { seed: 'gold-v1', games: ['matematik', 'turkce'], perGame: 10, flaggedPerGame: 4 })
    expect(first.map((item) => item.questionId)).toEqual(second.map((item) => item.questionId))
    for (const game of ['matematik', 'turkce']) {
      const items = first.filter((item) => item.game === game)
      expect(items).toHaveLength(10)
      expect(items.filter((item) => item.selectionStratum === 'flagged')).toHaveLength(4)
    }
  })

  it('reviewer paketinden model verdict ve selection stratum bilgisini cikarir', () => {
    const selected = selectBlindReviewSet(candidates, { seed: 'gold-v1', games: ['matematik'], perGame: 10, flaggedPerGame: 5 })
    const packet = toBlindReviewPacket(selected)
    const serialized = JSON.stringify(packet)
    expect(packet.items).toHaveLength(10)
    expect(serialized).not.toContain('selectionStratum')
    expect(packet.items.every((item) => !('verdict' in item))).toBe(true)
  })

  it('yetersiz flagged havuzunda sessizce kotayi dusurmez', () => {
    expect(() => selectBlindReviewSet(candidates.filter((item) => item.verdict === 'APPROVED'), {
      seed: 'gold-v1', games: ['matematik'], perGame: 10, flaggedPerGame: 5,
    })).toThrow('kotasi yetersiz')
  })
})

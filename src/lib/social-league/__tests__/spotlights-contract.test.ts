import { describe, expect, it } from 'vitest'
import { learningSpotlightsResultSchema } from '../server-contract'

const privacy = {
  cohortOnly: true,
  positiveOnly: true,
  verifiedOnly: true,
  fullTableHidden: true,
} as const

const activeResult = {
  status: 'active',
  weekStart: '2026-08-10',
  boards: {
    improved: {
      me: { eligible: true, rank: 5, value: 240 },
      entries: [
        { rank: 1, name: 'Ada', avatarUrl: null, value: 620, isMe: false },
        { rank: 2, name: 'Deniz', avatarUrl: '/avatars/deniz.png', value: 510, isMe: false },
        { rank: 3, name: 'Ece', avatarUrl: null, value: 430, isMe: false },
        { rank: 5, name: 'Sen', avatarUrl: null, value: 240, isMe: true },
      ],
    },
    consistent: {
      me: { eligible: true, rank: 2, value: 4 },
      entries: [
        { rank: 1, name: 'Ada', avatarUrl: null, value: 5, isMe: false },
        { rank: 2, name: 'Deniz', avatarUrl: null, value: 4, isMe: false },
        { rank: 2, name: 'Sen', avatarUrl: null, value: 4, isMe: true },
      ],
    },
    comeback: {
      me: { eligible: false, rank: null, value: null },
      entries: [],
    },
  },
  privacy,
} as const

describe('positive learning spotlights contract', () => {
  it('accepts top-three plus owner and dense-rank ties without identifiers', () => {
    expect(learningSpotlightsResultSchema.parse(activeResult)).toEqual(activeResult)
  })

  it('rejects hidden identifiers, unsafe avatars and more than three rival rows', () => {
    expect(learningSpotlightsResultSchema.safeParse({
      ...activeResult,
      cohortId: '11111111-2222-4333-8444-555555555555',
    }).success).toBe(false)

    expect(learningSpotlightsResultSchema.safeParse({
      ...activeResult,
      boards: {
        ...activeResult.boards,
        improved: {
          ...activeResult.boards.improved,
          entries: activeResult.boards.improved.entries.map((entry, index) => (
            index === 0 ? { ...entry, avatarUrl: '//attacker.example/avatar.png' } : entry
          )),
        },
      },
    }).success).toBe(false)

    expect(learningSpotlightsResultSchema.safeParse({
      ...activeResult,
      boards: {
        ...activeResult.boards,
        improved: {
          ...activeResult.boards.improved,
          entries: [
            ...activeResult.boards.improved.entries,
            { rank: 4, name: 'Fazla', avatarUrl: null, value: 300, isMe: false },
          ],
        },
      },
    }).success).toBe(false)
  })

  it('rejects owner-row mismatches and category values outside the public range', () => {
    expect(learningSpotlightsResultSchema.safeParse({
      ...activeResult,
      boards: {
        ...activeResult.boards,
        improved: {
          ...activeResult.boards.improved,
          me: { eligible: true, rank: 5, value: 241 },
        },
      },
    }).success).toBe(false)

    expect(learningSpotlightsResultSchema.safeParse({
      ...activeResult,
      boards: {
        ...activeResult.boards,
        consistent: {
          me: { eligible: true, rank: 1, value: 8 },
          entries: [{ rank: 1, name: 'Sen', avatarUrl: null, value: 8, isMe: true }],
        },
      },
    }).success).toBe(false)
  })

  it('requires empty boards when there is no league week', () => {
    expect(learningSpotlightsResultSchema.safeParse({
      ...activeResult,
      status: 'waiting',
      weekStart: null,
    }).success).toBe(false)

    const emptyBoard = { me: { eligible: false, rank: null, value: null }, entries: [] }
    expect(learningSpotlightsResultSchema.safeParse({
      status: 'waiting',
      weekStart: null,
      boards: { improved: emptyBoard, consistent: emptyBoard, comeback: emptyBoard },
      privacy,
    }).success).toBe(true)
  })
})

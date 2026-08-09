import { describe, expect, it } from 'vitest'
import {
  socialLeagueFormationResultSchema,
  socialLeagueResultSchema,
} from '../server-contract'

const activeResult = {
  status: 'active',
  optedIn: true,
  effectiveWeekStart: '2026-08-10',
  week: {
    startsOn: '2026-08-10',
    endsOn: '2026-08-17',
    tier: 'bronz',
    memberCount: 24,
    points: 18,
    rank: 7,
    zone: 'safe',
    isFinal: false,
  },
  entries: [{
    rank: 1,
    name: 'Yakın Rakip',
    avatarUrl: null,
    points: 30,
    activeDays: 2,
    isMe: false,
    zone: 'promotion',
  }],
  privacy: { bottomHidden: true, sessionCap: 15, dailyCap: 30 },
} as const

describe('social league server contract', () => {
  it('accepts the privacy-safe active result', () => {
    expect(socialLeagueResultSchema.parse(activeResult)).toEqual(activeResult)
    expect(socialLeagueResultSchema.safeParse({
      ...activeResult,
      entries: [{ ...activeResult.entries[0], avatarUrl: '/avatars/bilge.svg' }],
    }).success).toBe(true)
  })

  it('rejects identifiers, demotion rows and inconsistent final state', () => {
    expect(socialLeagueResultSchema.safeParse({
      ...activeResult,
      cohortId: '11111111-2222-4333-8444-555555555555',
    }).success).toBe(false)
    expect(socialLeagueResultSchema.safeParse({
      ...activeResult,
      entries: [{ ...activeResult.entries[0], zone: 'demotion' }],
    }).success).toBe(false)
    expect(socialLeagueResultSchema.safeParse({
      ...activeResult,
      status: 'finalized',
    }).success).toBe(false)
    expect(socialLeagueResultSchema.safeParse({
      ...activeResult,
      entries: [{ ...activeResult.entries[0], avatarUrl: 'https://attacker.example/avatar.png' }],
    }).success).toBe(false)
    expect(socialLeagueResultSchema.safeParse({
      ...activeResult,
      entries: [{ ...activeResult.entries[0], avatarUrl: '//attacker.example/avatar.png' }],
    }).success).toBe(false)
  })

  it('requires the exact cron result without hidden user data', () => {
    expect(socialLeagueFormationResultSchema.safeParse({
      weekStart: '2026-08-10',
      finalizedCohortCount: 2,
      formedCohortCount: 3,
      assignedMemberCount: 72,
      waitingMemberCount: 9,
      replayed: false,
    }).success).toBe(true)
    expect(socialLeagueFormationResultSchema.safeParse({
      weekStart: '2026-08-10',
      finalizedCohortCount: 2,
      formedCohortCount: 3,
      assignedMemberCount: 72,
      waitingMemberCount: 9,
      replayed: false,
      userIds: [],
    }).success).toBe(false)
  })
})

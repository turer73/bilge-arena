import { describe, expect, it } from 'vitest'
import { teamBossResultSchema } from '../server-contract'

const privacy = {
  cohortOnly: true,
  individualsHidden: true,
  verifiedOnly: true,
  rewardFree: true,
} as const

const active = {
  status: 'active',
  weekStart: '2026-08-10',
  boss: {
    name: 'Unutma Ejderi',
    phase: 'critical',
    target: 600,
    progress: 450,
    remaining: 150,
    progressPercent: 75,
    defeated: false,
  },
  team: {
    memberCount: 20,
    activeMemberCount: 7,
    ownerContribution: 30,
  },
  privacy,
} as const

describe('teamBossResultSchema', () => {
  it('accepts an exact active or defeated aggregate', () => {
    expect(teamBossResultSchema.parse(active)).toEqual(active)

    const defeated = {
      ...active,
      status: 'finalized',
      boss: {
        ...active.boss,
        phase: 'defeated',
        progress: 600,
        remaining: 0,
        progressPercent: 100,
        defeated: true,
      },
    }
    expect(teamBossResultSchema.parse(defeated)).toEqual(defeated)
  })

  it('rejects identifiers and individual contribution data', () => {
    expect(teamBossResultSchema.safeParse({
      ...active,
      cohortId: '11111111-2222-4333-8444-555555555555',
    }).success).toBe(false)
    expect(teamBossResultSchema.safeParse({
      ...active,
      team: { ...active.team, members: [{ name: 'Ada', contribution: 30 }] },
    }).success).toBe(false)
  })

  it.each([
    ['target/member', { boss: { ...active.boss, target: 630 } }],
    ['remaining', { boss: { ...active.boss, remaining: 149 } }],
    ['percent', { boss: { ...active.boss, progressPercent: 74 } }],
    ['phase', { boss: { ...active.boss, phase: 'weakened' } }],
    ['defeated', { boss: { ...active.boss, defeated: true } }],
    ['active members', { team: { ...active.team, activeMemberCount: 21 } }],
    ['owner bound', { team: { ...active.team, ownerContribution: 211 } }],
  ])('rejects a %s invariant mismatch', (_label, override) => {
    expect(teamBossResultSchema.safeParse({ ...active, ...override }).success).toBe(false)
  })

  it('requires all details together only for active or finalized states', () => {
    expect(teamBossResultSchema.parse({
      status: 'waiting',
      weekStart: null,
      boss: null,
      team: null,
      privacy,
    }).status).toBe('waiting')
    expect(teamBossResultSchema.safeParse({ ...active, status: 'waiting' }).success).toBe(false)
    expect(teamBossResultSchema.safeParse({ ...active, boss: null }).success).toBe(false)
  })
})

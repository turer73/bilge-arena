import { z } from 'zod'

export const socialLeagueTierSchema = z.enum(['bronz', 'gumus', 'altin', 'elmas'])
export const socialLeagueStatusSchema = z.enum(['opted_out', 'waiting', 'active', 'finalized'])

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const avatarUrlSchema = z.string().max(2048).refine((value) => {
  if (value.startsWith('/') && !value.startsWith('//')) return true
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    return (
      (url.hostname.endsWith('.supabase.co')
        && url.pathname.startsWith('/storage/v1/object/public/'))
      || url.hostname.endsWith('.googleusercontent.com')
    )
  } catch {
    return false
  }
}, 'avatar URL must be an approved HTTPS host or a local path')

const leagueWeekSchema = z.object({
  startsOn: isoDateSchema,
  endsOn: isoDateSchema,
  tier: socialLeagueTierSchema,
  memberCount: z.number().int().min(20).max(30),
  points: z.number().int().nonnegative(),
  rank: z.number().int().min(1).max(30).nullable(),
  zone: z.enum(['promotion', 'safe', 'demotion', 'pending']),
  isFinal: z.boolean(),
}).strict()

const visibleEntrySchema = z.object({
  rank: z.number().int().min(1).max(30),
  name: z.string().trim().min(1).max(80),
  avatarUrl: avatarUrlSchema.nullable(),
  points: z.number().int().nonnegative(),
  activeDays: z.number().int().min(0).max(7),
  isMe: z.boolean(),
  zone: z.enum(['promotion', 'safe']),
}).strict()

export const socialLeagueResultSchema = z.object({
  status: socialLeagueStatusSchema,
  optedIn: z.boolean(),
  effectiveWeekStart: isoDateSchema.nullable(),
  week: leagueWeekSchema.nullable(),
  entries: z.array(visibleEntrySchema).max(8),
  privacy: z.object({
    bottomHidden: z.literal(true),
    sessionCap: z.literal(15),
    dailyCap: z.literal(30),
  }).strict(),
}).strict().superRefine((value, context) => {
  const hasWeek = value.week !== null
  if ((value.status === 'active' || value.status === 'finalized') !== hasWeek) {
    context.addIssue({ code: 'custom', message: 'league status/week mismatch' })
  }
  if (value.status === 'active' && value.week?.isFinal !== false) {
    context.addIssue({ code: 'custom', message: 'active league cannot be final' })
  }
  if (value.status === 'finalized' && value.week?.isFinal !== true) {
    context.addIssue({ code: 'custom', message: 'finalized league must be final' })
  }
  if (!hasWeek && value.entries.length > 0) {
    context.addIssue({ code: 'custom', message: 'league entries require a week' })
  }
  if (new Set(value.entries.map((entry) => entry.rank)).size !== value.entries.length) {
    context.addIssue({ code: 'custom', message: 'league entry ranks must be unique' })
  }
  if (value.entries.filter((entry) => entry.isMe).length > 1) {
    context.addIssue({ code: 'custom', message: 'only one league entry can be mine' })
  }
})

export type SocialLeagueResult = z.infer<typeof socialLeagueResultSchema>

const learningSpotlightOwnerSchema = z.object({
  eligible: z.boolean(),
  rank: z.number().int().min(1).max(30).nullable(),
  value: z.number().int().positive().nullable(),
}).strict().superRefine((value, context) => {
  if (value.eligible !== (value.rank !== null && value.value !== null)) {
    context.addIssue({ code: 'custom', message: 'spotlight owner eligibility mismatch' })
  }
})

const learningSpotlightEntrySchema = z.object({
  rank: z.number().int().min(1).max(30),
  name: z.string().trim().min(1).max(80),
  avatarUrl: avatarUrlSchema.nullable(),
  value: z.number().int().positive(),
  isMe: z.boolean(),
}).strict()

const learningSpotlightBoardSchema = z.object({
  me: learningSpotlightOwnerSchema,
  entries: z.array(learningSpotlightEntrySchema).max(4),
}).strict().superRefine((value, context) => {
  const mine = value.entries.filter((entry) => entry.isMe)
  if (mine.length > 1 || value.entries.filter((entry) => !entry.isMe).length > 3) {
    context.addIssue({ code: 'custom', message: 'spotlight visibility limit exceeded' })
  }
  if (value.me.eligible) {
    if (mine.length !== 1
      || mine[0]?.rank !== value.me.rank
      || mine[0]?.value !== value.me.value) {
      context.addIssue({ code: 'custom', message: 'spotlight owner row mismatch' })
    }
  } else if (mine.length !== 0) {
    context.addIssue({ code: 'custom', message: 'ineligible owner cannot have a row' })
  }
})

export const learningSpotlightsResultSchema = z.object({
  status: socialLeagueStatusSchema,
  weekStart: isoDateSchema.nullable(),
  boards: z.object({
    improved: learningSpotlightBoardSchema,
    consistent: learningSpotlightBoardSchema,
    comeback: learningSpotlightBoardSchema,
  }).strict(),
  privacy: z.object({
    cohortOnly: z.literal(true),
    positiveOnly: z.literal(true),
    verifiedOnly: z.literal(true),
    fullTableHidden: z.literal(true),
  }).strict(),
}).strict().superRefine((value, context) => {
  const hasWeek = value.weekStart !== null
  if ((value.status === 'active' || value.status === 'finalized') !== hasWeek) {
    context.addIssue({ code: 'custom', message: 'spotlight status/week mismatch' })
  }

  const limits = {
    improved: { min: 1, max: 10_000 },
    consistent: { min: 2, max: 7 },
    comeback: { min: 2, max: 7 },
  } as const

  for (const kind of ['improved', 'consistent', 'comeback'] as const) {
    const board = value.boards[kind]
    const limit = limits[kind]
    const values = [board.me.value, ...board.entries.map((entry) => entry.value)]
      .filter((entryValue): entryValue is number => entryValue !== null)
    if (values.some((entryValue) => entryValue < limit.min || entryValue > limit.max)) {
      context.addIssue({ code: 'custom', message: `${kind} spotlight value out of range` })
    }
    if (!hasWeek && (board.me.eligible || board.entries.length > 0)) {
      context.addIssue({ code: 'custom', message: 'spotlight entries require a league week' })
    }
  }
})

export type LearningSpotlightsResult = z.infer<typeof learningSpotlightsResultSchema>

const teamBossPhaseSchema = z.enum(['awakening', 'weakened', 'critical', 'defeated'])

const teamBossSchema = z.object({
  name: z.literal('Unutma Ejderi'),
  phase: teamBossPhaseSchema,
  target: z.number().int().min(600).max(900),
  progress: z.number().int().nonnegative().max(900),
  remaining: z.number().int().nonnegative().max(900),
  progressPercent: z.number().int().min(0).max(100),
  defeated: z.boolean(),
}).strict().superRefine((value, context) => {
  const expectedPercent = Math.floor((value.progress * 100) / value.target)
  const expectedPhase = value.progress === value.target
    ? 'defeated'
    : value.progress * 3 < value.target
      ? 'awakening'
      : value.progress * 3 < value.target * 2
        ? 'weakened'
        : 'critical'

  if (value.target % 30 !== 0
    || value.progress > value.target
    || value.remaining !== value.target - value.progress
    || value.progressPercent !== expectedPercent
    || value.phase !== expectedPhase
    || value.defeated !== (value.progress === value.target)) {
    context.addIssue({ code: 'custom', message: 'team boss progress invariant mismatch' })
  }
})

const teamBossTeamSchema = z.object({
  memberCount: z.number().int().min(20).max(30),
  activeMemberCount: z.number().int().min(0).max(30),
  ownerContribution: z.number().int().min(0).max(210),
}).strict().superRefine((value, context) => {
  if (value.activeMemberCount > value.memberCount) {
    context.addIssue({ code: 'custom', message: 'team boss active-member count mismatch' })
  }
})

export const teamBossResultSchema = z.object({
  status: socialLeagueStatusSchema,
  weekStart: isoDateSchema.nullable(),
  boss: teamBossSchema.nullable(),
  team: teamBossTeamSchema.nullable(),
  privacy: z.object({
    cohortOnly: z.literal(true),
    individualsHidden: z.literal(true),
    verifiedOnly: z.literal(true),
    rewardFree: z.literal(true),
  }).strict(),
}).strict().superRefine((value, context) => {
  const hasWeek = value.status === 'active' || value.status === 'finalized'
  if (hasWeek !== (value.weekStart !== null && value.boss !== null && value.team !== null)) {
    context.addIssue({ code: 'custom', message: 'team boss status/detail mismatch' })
  }
  if (!hasWeek && (value.weekStart !== null || value.boss !== null || value.team !== null)) {
    context.addIssue({ code: 'custom', message: 'inactive team boss cannot expose details' })
  }
  if (value.boss && value.team && value.boss.target !== value.team.memberCount * 30) {
    context.addIssue({ code: 'custom', message: 'team boss target/member mismatch' })
  }
})

export type TeamBossResult = z.infer<typeof teamBossResultSchema>

export const socialLeaguePreferenceResultSchema = z.object({
  optedIn: z.boolean(),
  effectiveWeekStart: isoDateSchema,
  replayed: z.boolean(),
}).strict()

export const socialLeagueFormationResultSchema = z.object({
  weekStart: isoDateSchema,
  finalizedCohortCount: z.number().int().nonnegative(),
  formedCohortCount: z.number().int().nonnegative(),
  assignedMemberCount: z.number().int().nonnegative(),
  waitingMemberCount: z.number().int().nonnegative(),
  replayed: z.boolean(),
}).strict()

export function socialLeagueRpcStatus(code?: string): number {
  if (code === '42501') return 403
  if (code === 'P0002') return 404
  if (code === '22023' || code === '23514' || code === '23505' || code === 'P0001') {
    return 409
  }
  return 500
}

export function socialLeagueNoStoreJson(
  body: unknown,
  init?: { status?: number; headers?: HeadersInit },
): Response {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return Response.json(body, { ...init, headers })
}

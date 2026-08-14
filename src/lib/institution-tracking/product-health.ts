export const PRODUCT_HEALTH_METRIC_VERSION = 'product-health-v1' as const

export type ProductEnvironment = 'production' | 'demo' | 'test'
export type ProductAccountType = 'learner' | 'teacher' | 'manager' | 'admin'
export type MeaningfulActivityKind =
  | 'verified_question_attempt'
  | 'verified_game_session'
  | 'published_program_activity'

export interface ProductLearnerRecord {
  learnerKey: string
  registeredAt: string
  accountType: ProductAccountType
  environment: ProductEnvironment
  synthetic: boolean
  dataIncluded: boolean
  deletedAt: string | null
  blockedAt: string | null
}

export interface ProductActivityRecord {
  activityKey: string
  learnerKey: string
  occurredAt: string
  kind: MeaningfulActivityKind
  verified: boolean
}

export interface RateMetric {
  numerator: number
  denominator: number
  percentage: number | null
  interval95: { lower: number; upper: number } | null
  sampleStatus: 'available' | 'insufficient'
}

export interface ProductHealthReport {
  metricVersion: typeof PRODUCT_HEALTH_METRIC_VERSION
  calculatedAt: string
  timeZone: string
  environment: ProductEnvironment
  minimumSampleSize: number
  eligibleRegisteredCount: number
  excluded: {
    nonLearner: number
    otherEnvironment: number
    synthetic: number
    dataExcluded: number
    deletedOrBlocked: number
    futureRegistration: number
  }
  activation: {
    everQuestion: RateMetric
    within24Hours: RateMetric
    within7Days: RateMetric
    medianMinutesToFirstQuestion: number | null
  }
  retention: {
    signup: { d1: RateMetric; d7: RateMetric; d30: RateMetric }
    activatedOnSignupDay: { d1: RateMetric; d7: RateMetric; d30: RateMetric }
  }
  weeklyActive: RateMetric & {
    windowStartDate: string
    windowEndDateExclusive: string
  }
}

export interface ProductHealthInput {
  learners: ProductLearnerRecord[]
  activities: ProductActivityRecord[]
  asOf: string
  environment?: ProductEnvironment
  timeZone?: string
  minimumSampleSize?: number
}

export interface StreakReturnReport {
  metricVersion: typeof PRODUCT_HEALTH_METRIC_VERSION
  anchorDate: string
  timeZone: string
  minimumStreakDays: number
  matchedStratumCount: number
  excludedWithoutMinimumStreak: number
  excludedUnmatched: { broken: number; maintained: number }
  horizons: Record<'d1' | 'd3' | 'd7', {
    broken: RateMetric
    maintained: RateMetric
    breakMinusMaintainedPoints: number | null
    breakRelativeDifferencePercent: number | null
  }>
}

export interface StreakReturnInput extends ProductHealthInput {
  anchorDate: string
  minimumStreakDays?: number
}

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000
const meaningfulKinds = new Set<MeaningfulActivityKind>([
  'verified_question_attempt',
  'verified_game_session',
  'published_program_activity',
])

function instant(value: string, field: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new RangeError(`${field} must be an ISO timestamp`)
  return parsed
}

function whole(value: number | undefined, fallback: number, minimum = 1): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.trunc(value))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function wilson95(numerator: number, denominator: number): { lower: number; upper: number } {
  const z = 1.959963984540054
  const proportion = numerator / denominator
  const zSquared = z * z
  const denominatorAdjustment = 1 + zSquared / denominator
  const center = (proportion + zSquared / (2 * denominator)) / denominatorAdjustment
  const margin = (z / denominatorAdjustment) * Math.sqrt(
    (proportion * (1 - proportion) / denominator) + (zSquared / (4 * denominator * denominator)),
  )
  return {
    lower: round1(Math.max(0, center - margin) * 100),
    upper: round1(Math.min(1, center + margin) * 100),
  }
}

function rate(numerator: number, denominator: number, minimumSampleSize: number): RateMetric {
  if (denominator < minimumSampleSize || denominator === 0) {
    return {
      numerator,
      denominator,
      percentage: null,
      interval95: null,
      sampleStatus: 'insufficient',
    }
  }
  return {
    numerator,
    denominator,
    percentage: round1((numerator / denominator) * 100),
    interval95: wilson95(numerator, denominator),
    sampleStatus: 'available',
  }
}

const dateFormatterCache = new Map<string, Intl.DateTimeFormat>()

function localDateParts(timestamp: number, timeZone: string): { year: number; month: number; day: number } {
  let formatter = dateFormatterCache.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    dateFormatterCache.set(timeZone, formatter)
  }
  const parts = formatter.formatToParts(new Date(timestamp))
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value
    if (!value) throw new RangeError(`unable to resolve ${type} in ${timeZone}`)
    return Number(value)
  }
  return { year: read('year'), month: read('month'), day: read('day') }
}

function localDayNumber(timestamp: number, timeZone: string): number {
  const { year, month, day } = localDateParts(timestamp, timeZone)
  return Math.trunc(Date.UTC(year, month - 1, day) / DAY_MS)
}

function dateKeyFromDay(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10)
}

function dayFromDateKey(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new RangeError('anchorDate must be YYYY-MM-DD')
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== value) {
    throw new RangeError('anchorDate must be a real calendar date')
  }
  return Math.trunc(parsed / DAY_MS)
}

type PreparedLearner = ProductLearnerRecord & { registeredAtMs: number; registeredDay: number }
type PreparedActivity = ProductActivityRecord & { occurredAtMs: number; occurredDay: number }

function prepare(input: ProductHealthInput): {
  asOfMs: number
  asOfDay: number
  timeZone: string
  environment: ProductEnvironment
  minimumSampleSize: number
  eligible: PreparedLearner[]
  activitiesByLearner: Map<string, PreparedActivity[]>
  excluded: ProductHealthReport['excluded']
} {
  const asOfMs = instant(input.asOf, 'asOf')
  const timeZone = input.timeZone ?? 'Europe/Istanbul'
  const environment = input.environment ?? 'production'
  const minimumSampleSize = whole(input.minimumSampleSize, 20)
  const asOfDay = localDayNumber(asOfMs, timeZone)
  const excluded = {
    nonLearner: 0,
    otherEnvironment: 0,
    synthetic: 0,
    dataExcluded: 0,
    deletedOrBlocked: 0,
    futureRegistration: 0,
  }
  const eligible: PreparedLearner[] = []
  const seenLearners = new Set<string>()

  for (const learner of input.learners) {
    if (!learner.learnerKey || seenLearners.has(learner.learnerKey)) {
      throw new Error('learnerKey must be non-empty and unique')
    }
    seenLearners.add(learner.learnerKey)
    const registeredAtMs = instant(learner.registeredAt, 'registeredAt')
    if (learner.accountType !== 'learner') excluded.nonLearner += 1
    else if (learner.synthetic) excluded.synthetic += 1
    else if (learner.environment !== environment) excluded.otherEnvironment += 1
    else if (!learner.dataIncluded) excluded.dataExcluded += 1
    else if (
      (learner.deletedAt !== null && instant(learner.deletedAt, 'deletedAt') <= asOfMs)
      || (learner.blockedAt !== null && instant(learner.blockedAt, 'blockedAt') <= asOfMs)
    ) excluded.deletedOrBlocked += 1
    else if (registeredAtMs > asOfMs) excluded.futureRegistration += 1
    else eligible.push({
      ...learner,
      registeredAtMs,
      registeredDay: localDayNumber(registeredAtMs, timeZone),
    })
  }

  const eligibleByKey = new Map(eligible.map((learner) => [learner.learnerKey, learner]))
  const activitiesByLearner = new Map<string, PreparedActivity[]>()
  const activityFingerprints = new Map<string, string>()
  for (const activity of input.activities) {
    if (!activity.activityKey) throw new Error('activityKey must be non-empty')
    const fingerprint = `${activity.learnerKey}|${activity.occurredAt}|${activity.kind}|${activity.verified}`
    const previous = activityFingerprints.get(activity.activityKey)
    if (previous !== undefined) {
      if (previous !== fingerprint) throw new Error('conflicting activityKey payload')
      continue
    }
    activityFingerprints.set(activity.activityKey, fingerprint)
    const learner = eligibleByKey.get(activity.learnerKey)
    if (!learner || !activity.verified || !meaningfulKinds.has(activity.kind)) continue
    const occurredAtMs = instant(activity.occurredAt, 'occurredAt')
    if (occurredAtMs < learner.registeredAtMs || occurredAtMs > asOfMs) continue
    const prepared: PreparedActivity = {
      ...activity,
      occurredAtMs,
      occurredDay: localDayNumber(occurredAtMs, timeZone),
    }
    const current = activitiesByLearner.get(activity.learnerKey) ?? []
    current.push(prepared)
    activitiesByLearner.set(activity.learnerKey, current)
  }
  for (const activities of activitiesByLearner.values()) {
    activities.sort((left, right) => left.occurredAtMs - right.occurredAtMs)
  }

  return {
    asOfMs,
    asOfDay,
    timeZone,
    environment,
    minimumSampleSize,
    eligible,
    activitiesByLearner,
    excluded,
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
  return round1(value)
}

function retentionMetric(
  learners: PreparedLearner[],
  activitiesByLearner: Map<string, PreparedActivity[]>,
  asOfDay: number,
  dayOffset: number,
  minimumSampleSize: number,
): RateMetric {
  const matured = learners.filter((learner) => asOfDay - learner.registeredDay >= dayOffset)
  const returned = matured.filter((learner) => (
    activitiesByLearner.get(learner.learnerKey)?.some(
      (activity) => activity.occurredDay - learner.registeredDay === dayOffset,
    ) ?? false
  )).length
  return rate(returned, matured.length, minimumSampleSize)
}

export function calculateProductHealth(input: ProductHealthInput): ProductHealthReport {
  const prepared = prepare(input)
  const firstQuestions = new Map<string, PreparedActivity>()
  for (const learner of prepared.eligible) {
    const firstQuestion = prepared.activitiesByLearner.get(learner.learnerKey)?.find(
      (activity) => activity.kind === 'verified_question_attempt',
    )
    if (firstQuestion) firstQuestions.set(learner.learnerKey, firstQuestion)
  }

  const matured24Hours = prepared.eligible.filter(
    (learner) => prepared.asOfMs - learner.registeredAtMs >= 24 * HOUR_MS,
  )
  const matured7Days = prepared.eligible.filter(
    (learner) => prepared.asOfMs - learner.registeredAtMs >= 7 * DAY_MS,
  )
  const activatedWithin = (learners: PreparedLearner[], durationMs: number): number => learners.filter((learner) => {
    const first = firstQuestions.get(learner.learnerKey)
    return first !== undefined && first.occurredAtMs - learner.registeredAtMs < durationMs
  }).length
  const activatedOnSignupDay = prepared.eligible.filter((learner) => {
    const first = firstQuestions.get(learner.learnerKey)
    return first !== undefined && first.occurredDay === learner.registeredDay
  })

  const wauStartDay = prepared.asOfDay - 7
  const wauEndDay = prepared.asOfDay
  const wauEligible = prepared.eligible.filter((learner) => learner.registeredDay < wauEndDay)
  const weeklyActiveCount = wauEligible.filter((learner) => (
    prepared.activitiesByLearner.get(learner.learnerKey)?.some(
      (activity) => activity.occurredDay >= wauStartDay && activity.occurredDay < wauEndDay,
    ) ?? false
  )).length

  return {
    metricVersion: PRODUCT_HEALTH_METRIC_VERSION,
    calculatedAt: new Date(prepared.asOfMs).toISOString(),
    timeZone: prepared.timeZone,
    environment: prepared.environment,
    minimumSampleSize: prepared.minimumSampleSize,
    eligibleRegisteredCount: prepared.eligible.length,
    excluded: prepared.excluded,
    activation: {
      everQuestion: rate(firstQuestions.size, prepared.eligible.length, prepared.minimumSampleSize),
      within24Hours: rate(
        activatedWithin(matured24Hours, 24 * HOUR_MS),
        matured24Hours.length,
        prepared.minimumSampleSize,
      ),
      within7Days: rate(
        activatedWithin(matured7Days, 7 * DAY_MS),
        matured7Days.length,
        prepared.minimumSampleSize,
      ),
      medianMinutesToFirstQuestion: median([...firstQuestions.entries()].map(([learnerKey, activity]) => {
        const learner = prepared.eligible.find((candidate) => candidate.learnerKey === learnerKey)
        if (!learner) throw new Error('eligible learner disappeared')
        return (activity.occurredAtMs - learner.registeredAtMs) / 60_000
      })),
    },
    retention: {
      signup: {
        d1: retentionMetric(prepared.eligible, prepared.activitiesByLearner, prepared.asOfDay, 1, prepared.minimumSampleSize),
        d7: retentionMetric(prepared.eligible, prepared.activitiesByLearner, prepared.asOfDay, 7, prepared.minimumSampleSize),
        d30: retentionMetric(prepared.eligible, prepared.activitiesByLearner, prepared.asOfDay, 30, prepared.minimumSampleSize),
      },
      activatedOnSignupDay: {
        d1: retentionMetric(activatedOnSignupDay, prepared.activitiesByLearner, prepared.asOfDay, 1, prepared.minimumSampleSize),
        d7: retentionMetric(activatedOnSignupDay, prepared.activitiesByLearner, prepared.asOfDay, 7, prepared.minimumSampleSize),
        d30: retentionMetric(activatedOnSignupDay, prepared.activitiesByLearner, prepared.asOfDay, 30, prepared.minimumSampleSize),
      },
    },
    weeklyActive: {
      ...rate(weeklyActiveCount, wauEligible.length, prepared.minimumSampleSize),
      windowStartDate: dateKeyFromDay(wauStartDay),
      windowEndDateExclusive: dateKeyFromDay(wauEndDay),
    },
  }
}

function bucket(value: number, boundaries: readonly [number, string][], fallback: string): string {
  for (const [maximumExclusive, label] of boundaries) {
    if (value < maximumExclusive) return label
  }
  return fallback
}

function streakStratum(accountAgeDays: number, prior14ActiveDays: number, priorStreakDays: number): string {
  const age = bucket(accountAgeDays, [[7, '0_6'], [30, '7_29'], [90, '30_89']], '90_plus')
  const activity = bucket(prior14ActiveDays, [[4, '0_3'], [8, '4_7'], [12, '8_11']], '12_14')
  const streak = bucket(priorStreakDays, [[5, '3_4'], [8, '5_7']], '8_plus')
  return `${age}|${activity}|${streak}`
}

export function calculateStreakReturn(input: StreakReturnInput): StreakReturnReport {
  const prepared = prepare(input)
  const anchorDay = dayFromDateKey(input.anchorDate)
  if (anchorDay > prepared.asOfDay) throw new RangeError('anchorDate cannot be after asOf')
  const minimumStreakDays = whole(input.minimumStreakDays, 3, 3)
  const strata = new Map<string, { broken: PreparedLearner[]; maintained: PreparedLearner[] }>()
  let excludedWithoutMinimumStreak = 0

  for (const learner of prepared.eligible) {
    if (learner.registeredDay >= anchorDay) continue
    const activeDays = new Set(
      (prepared.activitiesByLearner.get(learner.learnerKey) ?? []).map((activity) => activity.occurredDay),
    )
    let priorStreakDays = 0
    while (activeDays.has(anchorDay - priorStreakDays - 1)) priorStreakDays += 1
    if (priorStreakDays < minimumStreakDays) {
      excludedWithoutMinimumStreak += 1
      continue
    }
    let prior14ActiveDays = 0
    for (let day = anchorDay - 14; day < anchorDay; day += 1) {
      if (activeDays.has(day)) prior14ActiveDays += 1
    }
    const key = streakStratum(anchorDay - learner.registeredDay, prior14ActiveDays, priorStreakDays)
    const current = strata.get(key) ?? { broken: [], maintained: [] }
    if (activeDays.has(anchorDay)) current.maintained.push(learner)
    else current.broken.push(learner)
    strata.set(key, current)
  }

  const matched = [...strata.values()].filter(
    (stratum) => stratum.broken.length > 0 && stratum.maintained.length > 0,
  )
  const unmatched = [...strata.values()].filter(
    (stratum) => stratum.broken.length === 0 || stratum.maintained.length === 0,
  )
  const broken = matched.flatMap((stratum) => stratum.broken)
  const maintained = matched.flatMap((stratum) => stratum.maintained)
  const returnedWithin = (learners: PreparedLearner[], horizon: number): number => learners.filter((learner) => (
    prepared.activitiesByLearner.get(learner.learnerKey)?.some(
      (activity) => activity.occurredDay > anchorDay && activity.occurredDay <= anchorDay + horizon,
    ) ?? false
  )).length
  const horizon = (days: number) => {
    const matured = prepared.asOfDay >= anchorDay + days
    const brokenRate = rate(
      matured ? returnedWithin(broken, days) : 0,
      matured ? broken.length : 0,
      prepared.minimumSampleSize,
    )
    const maintainedRate = rate(
      matured ? returnedWithin(maintained, days) : 0,
      matured ? maintained.length : 0,
      prepared.minimumSampleSize,
    )
    const comparable = brokenRate.percentage !== null && maintainedRate.percentage !== null
    const difference = comparable
      ? round1(brokenRate.percentage! - maintainedRate.percentage!)
      : null
    const relative = comparable && maintainedRate.percentage! > 0
      ? round1((difference! / maintainedRate.percentage!) * 100)
      : null
    return {
      broken: brokenRate,
      maintained: maintainedRate,
      breakMinusMaintainedPoints: difference,
      breakRelativeDifferencePercent: relative,
    }
  }

  return {
    metricVersion: PRODUCT_HEALTH_METRIC_VERSION,
    anchorDate: input.anchorDate,
    timeZone: prepared.timeZone,
    minimumStreakDays,
    matchedStratumCount: matched.length,
    excludedWithoutMinimumStreak,
    excludedUnmatched: {
      broken: unmatched.reduce((sum, stratum) => sum + stratum.broken.length, 0),
      maintained: unmatched.reduce((sum, stratum) => sum + stratum.maintained.length, 0),
    },
    horizons: { d1: horizon(1), d3: horizon(3), d7: horizon(7) },
  }
}

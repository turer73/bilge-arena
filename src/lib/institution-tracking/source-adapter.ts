import {
  calculateProductHealth,
  type ProductHealthReport,
  ProductAccountType,
  ProductActivityRecord,
  ProductEnvironment,
  ProductLearnerRecord,
} from './product-health'

export interface ProductProfileSourceRow {
  userId: string
  registeredAt: string | null
  deletedAt: string | null
  legacyRole: string | null
}

export interface ProductRoleSourceRow {
  userId: string
  roleSlug: string
}

export interface VerifiedAnswerSourceRow {
  answerId: string
  userId: string
  answeredAt: string | null
  answerSessionId: string
  selectedOption: number | null
  skipped: boolean
  verifiedAttemptId: string | null
  verifiedAttemptCompletedAt: string | null
  verifiedAttemptSessionId: string | null
}

export interface VerifiedSessionSourceRow {
  attemptId: string
  userId: string
  completedAt: string | null
  sessionId: string | null
  sessionStatus: string | null
}

export interface CompletedPlanItemSourceRow {
  planId: string
  position: number
  userId: string
  completedAt: string | null
}

export interface ProductAccountClassification {
  version: string
  attestedComplete: boolean
  demoUserIds: ReadonlySet<string>
  testUserIds: ReadonlySet<string>
  syntheticUserIds: ReadonlySet<string>
  dataExcludedUserIds: ReadonlySet<string>
  blockedUserIds: ReadonlySet<string>
}

export interface ProductHealthSourceSnapshot {
  profiles: ProductProfileSourceRow[]
  roles: ProductRoleSourceRow[]
  verifiedAnswers: VerifiedAnswerSourceRow[]
  verifiedSessions: VerifiedSessionSourceRow[]
  completedPlanItems: CompletedPlanItemSourceRow[]
  classification: ProductAccountClassification
  capturedAt: string
}

export interface ProductHealthSourceQuality {
  capturedAt: string
  classificationVersion: string
  ready: boolean
  blockers: string[]
  profiles: {
    sourceRows: number
    acceptedRows: number
    duplicateRows: number
    missingRegistration: number
    classifiedDemo: number
    classifiedTest: number
    classifiedSynthetic: number
    classifiedDataExcluded: number
    classifiedNonLearner: number
  }
  activities: {
    verifiedAnswerSourceRows: number
    verifiedSessionSourceRows: number
    completedPlanItemSourceRows: number
    acceptedRows: number
    duplicateRows: number
    orphanRows: number
    invalidVerificationRows: number
    missingTimestampRows: number
  }
}

export interface AdaptedProductHealthSnapshot {
  learners: ProductLearnerRecord[]
  activities: ProductActivityRecord[]
  quality: ProductHealthSourceQuality
}

const adminRoles = new Set(['super_admin', 'content_manager', 'moderator', 'support_agent'])
const teacherRoles = new Set(['institution_pilot_staff', 'teacher'])
const managerRoles = new Set(['institution_manager'])

function validInstant(value: string | null): value is string {
  return value !== null && Number.isFinite(Date.parse(value))
}

function environmentFor(
  userId: string,
  classification: ProductAccountClassification,
): ProductEnvironment {
  if (classification.syntheticUserIds.has(userId) || classification.testUserIds.has(userId)) return 'test'
  if (classification.demoUserIds.has(userId)) return 'demo'
  return 'production'
}

function accountTypeFor(
  profile: ProductProfileSourceRow,
  roleSlugs: ReadonlySet<string>,
): ProductAccountType {
  if (profile.legacyRole === 'admin' || [...roleSlugs].some((role) => adminRoles.has(role))) return 'admin'
  if ([...roleSlugs].some((role) => managerRoles.has(role))) return 'manager'
  if ([...roleSlugs].some((role) => teacherRoles.has(role))) return 'teacher'
  return 'learner'
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0
}

/**
 * Converts rows returned by read-only, server-side source queries into the
 * pure product-health calculator input. It never returns names, email
 * addresses, question ids, selected options or answer correctness.
 *
 * Production inclusion fails closed until the demo/test/synthetic inventory
 * has an explicit version and has been attested complete by the operator.
 */
export function adaptProductHealthSnapshot(
  snapshot: ProductHealthSourceSnapshot,
): AdaptedProductHealthSnapshot {
  const blockers: string[] = []
  if (!validInstant(snapshot.capturedAt)) blockers.push('invalid_capture_timestamp')
  if (!nonEmpty(snapshot.classification.version)) blockers.push('missing_classification_version')
  if (!snapshot.classification.attestedComplete) blockers.push('account_classification_not_attested')

  const rolesByUser = new Map<string, Set<string>>()
  for (const row of snapshot.roles) {
    if (!nonEmpty(row.userId) || !nonEmpty(row.roleSlug)) continue
    const current = rolesByUser.get(row.userId) ?? new Set<string>()
    current.add(row.roleSlug)
    rolesByUser.set(row.userId, current)
  }

  const learnerById = new Map<string, ProductLearnerRecord>()
  let duplicateProfiles = 0
  let missingRegistration = 0
  for (const profile of snapshot.profiles) {
    if (!nonEmpty(profile.userId)) continue
    if (learnerById.has(profile.userId)) {
      duplicateProfiles += 1
      continue
    }
    if (!validInstant(profile.registeredAt)) {
      missingRegistration += 1
      continue
    }
    const blocked = snapshot.classification.blockedUserIds.has(profile.userId)
    learnerById.set(profile.userId, {
      learnerKey: profile.userId,
      registeredAt: profile.registeredAt,
      accountType: accountTypeFor(profile, rolesByUser.get(profile.userId) ?? new Set()),
      environment: environmentFor(profile.userId, snapshot.classification),
      synthetic: snapshot.classification.syntheticUserIds.has(profile.userId),
      dataIncluded: snapshot.classification.attestedComplete
        && !snapshot.classification.dataExcludedUserIds.has(profile.userId),
      deletedAt: validInstant(profile.deletedAt) ? profile.deletedAt : null,
      blockedAt: blocked ? snapshot.capturedAt : null,
    })
  }

  if (duplicateProfiles > 0) blockers.push('duplicate_profile_rows')
  if (missingRegistration > 0) blockers.push('profiles_missing_registration')

  const activities = new Map<string, ProductActivityRecord>()
  let duplicateActivities = 0
  let orphanRows = 0
  let invalidVerificationRows = 0
  let missingTimestampRows = 0
  const accept = (activity: ProductActivityRecord): void => {
    if (!learnerById.has(activity.learnerKey)) {
      orphanRows += 1
      return
    }
    if (activities.has(activity.activityKey)) {
      duplicateActivities += 1
      return
    }
    activities.set(activity.activityKey, activity)
  }

  for (const row of snapshot.verifiedAnswers) {
    if (!validInstant(row.answeredAt)) {
      missingTimestampRows += 1
      continue
    }
    if (
      !nonEmpty(row.answerId)
      || row.selectedOption === null
      || row.skipped
      || !nonEmpty(row.answerSessionId)
      || !row.verifiedAttemptId
      || !validInstant(row.verifiedAttemptCompletedAt)
      || row.verifiedAttemptSessionId !== row.answerSessionId
    ) {
      invalidVerificationRows += 1
      continue
    }
    accept({
      activityKey: `answer:${row.answerId}`,
      learnerKey: row.userId,
      occurredAt: row.answeredAt,
      kind: 'verified_question_attempt',
      verified: true,
    })
  }

  for (const row of snapshot.verifiedSessions) {
    if (!validInstant(row.completedAt)) {
      missingTimestampRows += 1
      continue
    }
    if (!nonEmpty(row.attemptId) || !row.sessionId || row.sessionStatus !== 'completed') {
      invalidVerificationRows += 1
      continue
    }
    accept({
      activityKey: `attempt:${row.attemptId}`,
      learnerKey: row.userId,
      occurredAt: row.completedAt,
      kind: 'verified_game_session',
      verified: true,
    })
  }

  for (const row of snapshot.completedPlanItems) {
    if (!validInstant(row.completedAt)) {
      missingTimestampRows += 1
      continue
    }
    if (!nonEmpty(row.planId) || !Number.isInteger(row.position) || row.position < 1 || row.position > 15) {
      invalidVerificationRows += 1
      continue
    }
    accept({
      activityKey: `plan:${row.planId}:${row.position}`,
      learnerKey: row.userId,
      occurredAt: row.completedAt,
      kind: 'published_program_activity',
      verified: true,
    })
  }

  if (missingTimestampRows > 0) blockers.push('activity_rows_missing_timestamp')
  if (orphanRows > 0) blockers.push('orphan_activity_rows')
  if (invalidVerificationRows > 0) blockers.push('invalid_verification_rows')
  if (duplicateActivities > 0) blockers.push('duplicate_activity_rows')

  const learners = [...learnerById.values()]
  const quality: ProductHealthSourceQuality = {
    capturedAt: snapshot.capturedAt,
    classificationVersion: snapshot.classification.version,
    ready: blockers.length === 0,
    blockers,
    profiles: {
      sourceRows: snapshot.profiles.length,
      acceptedRows: learners.length,
      duplicateRows: duplicateProfiles,
      missingRegistration,
      classifiedDemo: learners.filter((row) => row.environment === 'demo').length,
      classifiedTest: learners.filter((row) => row.environment === 'test' && !row.synthetic).length,
      classifiedSynthetic: learners.filter((row) => row.synthetic).length,
      classifiedDataExcluded: learners.filter((row) => !row.dataIncluded).length,
      classifiedNonLearner: learners.filter((row) => row.accountType !== 'learner').length,
    },
    activities: {
      verifiedAnswerSourceRows: snapshot.verifiedAnswers.length,
      verifiedSessionSourceRows: snapshot.verifiedSessions.length,
      completedPlanItemSourceRows: snapshot.completedPlanItems.length,
      acceptedRows: activities.size,
      duplicateRows: duplicateActivities,
      orphanRows,
      invalidVerificationRows,
      missingTimestampRows,
    },
  }

  return { learners, activities: [...activities.values()], quality }
}

/** Fail-closed convenience boundary for internal reports. */
export function calculateProductHealthFromSnapshot(
  snapshot: ProductHealthSourceSnapshot,
  options: {
    environment?: ProductEnvironment
    timeZone?: string
    minimumSampleSize?: number
  } = {},
): { report: ProductHealthReport; quality: ProductHealthSourceQuality } {
  const adapted = adaptProductHealthSnapshot(snapshot)
  if (!adapted.quality.ready) {
    throw new Error(`product health source is not ready: ${adapted.quality.blockers.join(',')}`)
  }
  return {
    report: calculateProductHealth({
      learners: adapted.learners,
      activities: adapted.activities,
      asOf: snapshot.capturedAt,
      environment: options.environment,
      timeZone: options.timeZone,
      minimumSampleSize: options.minimumSampleSize,
    }),
    quality: adapted.quality,
  }
}

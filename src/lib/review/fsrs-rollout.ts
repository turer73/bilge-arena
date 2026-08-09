/**
 * Genel quiz FSRS rollout karari.
 *
 * Bu yardimci yalnizca server route'larinda kullanilmalidir: konfigurasyon
 * `process.env`'den okunur ve karar/kovasi istemciye veya loglara tasinmaz.
 */

export interface FsrsRolloutEnv {
  [key: string]: string | undefined
  FSRS_REVIEW_ENABLED?: string
  FSRS_REVIEW_ROLLOUT_PERCENT?: string
  FSRS_REVIEW_KILL_SWITCH?: string
  FSRS_PERSISTENT_READ_ENABLED?: string
  FSRS_PERSISTENT_READ_PERCENT?: string
  FSRS_PERSISTENT_READ_KILL_SWITCH?: string
}

export type FsrsRolloutReason =
  | 'kill_switch'
  | 'master_disabled'
  | 'percentage_zero'
  | 'cohort'
  | 'outside_cohort'

export interface FsrsRolloutDecision {
  enabled: boolean
  /** Stable, non-PII 0..99 cohort kovasi. */
  bucket: number
  /** Effective rollout yuzdesi (gecersiz konfigurasyon = 0). */
  percentage: number
  reason: FsrsRolloutReason
}

export type PersistentFsrsReadReason = FsrsRolloutReason
export type PersistentFsrsReadDecision = FsrsRolloutDecision & {
  reason: PersistentFsrsReadReason
}

/** FNV-1a ile ayni userId icin kararlı 0..99 kova üretir. */
export function fsrsRolloutBucket(userId: string): number {
  let hash = 0x811c9dc5

  for (let index = 0; index < userId.length; index += 1) {
    hash ^= userId.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash % 100
}

function isTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true'
}

function parsePercentage(value: string | undefined): number {
  if (value === undefined) return 0

  const parsed = Number(value.trim())
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : 0
}

/**
 * Fail-closed rollout karari. `env` parametresi testlerde izole konfigurasyon
 * vermek icindir; route cagrilarinda varsayilan olarak process.env kullanilir.
 */
export function getFsrsReviewRollout(
  userId: string,
  env: FsrsRolloutEnv = process.env,
): FsrsRolloutDecision {
  const bucket = fsrsRolloutBucket(userId)
  const percentage = parsePercentage(env.FSRS_REVIEW_ROLLOUT_PERCENT)

  if (isTrue(env.FSRS_REVIEW_KILL_SWITCH)) {
    return { enabled: false, bucket, percentage, reason: 'kill_switch' }
  }

  if (!isTrue(env.FSRS_REVIEW_ENABLED)) {
    return { enabled: false, bucket, percentage, reason: 'master_disabled' }
  }

  if (percentage === 0) {
    return { enabled: false, bucket, percentage, reason: 'percentage_zero' }
  }

  if (bucket < percentage) {
    return { enabled: true, bucket, percentage, reason: 'cohort' }
  }

  return { enabled: false, bucket, percentage, reason: 'outside_cohort' }
}

/**
 * Kalici review_cards okuma kaynagi icin bagimsiz, fail-closed rollout.
 * Trigger yazimi migration sonrasi tum kullanicilar icin acik kalabilir; bu
 * karar yalniz okumanin kalici karttan mi, mevcut history-fold yolundan mi
 * yapilacagini belirler.
 */
export function getPersistentFsrsReadRollout(
  userId: string,
  env: FsrsRolloutEnv = process.env,
): PersistentFsrsReadDecision {
  const bucket = fsrsRolloutBucket(userId)
  const percentage = parsePercentage(env.FSRS_PERSISTENT_READ_PERCENT)

  if (isTrue(env.FSRS_PERSISTENT_READ_KILL_SWITCH)) {
    return { enabled: false, bucket, percentage, reason: 'kill_switch' }
  }

  if (!isTrue(env.FSRS_PERSISTENT_READ_ENABLED)) {
    return { enabled: false, bucket, percentage, reason: 'master_disabled' }
  }

  if (percentage === 0) {
    return { enabled: false, bucket, percentage, reason: 'percentage_zero' }
  }

  if (bucket < percentage) {
    return { enabled: true, bucket, percentage, reason: 'cohort' }
  }

  return { enabled: false, bucket, percentage, reason: 'outside_cohort' }
}

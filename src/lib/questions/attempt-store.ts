import { Redis } from '@upstash/redis'

const ATTEMPT_TTL_SECONDS = 2 * 60 * 60
const memoryAttempts = new Map<string, { selectedOption: number; expiresAt: number }>()

let redis: Redis | null = null
let redisChecked = false

function getRedis(): Redis | null {
  if (redisChecked) return redis
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (url && token) redis = new Redis({ url, token })
  if (!redis && process.env.NODE_ENV === 'production') {
    throw new Error('Question attempt store is not configured')
  }
  redisChecked = true
  return redis
}

function attemptKey(actorKey: string, questionId: string): string {
  return `question-attempt:v1:${actorKey}:${questionId}`
}

function readMemory(key: string): number | null {
  const entry = memoryAttempts.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    memoryAttempts.delete(key)
    return null
  }
  return entry.selectedOption
}

/** İlk seçimi atomik olarak sabitler; sonraki çağrılar ilk seçimi döndürür. */
export async function recordFirstQuestionAttempt(
  actorKey: string,
  questionId: string,
  selectedOption: number,
): Promise<number> {
  const key = attemptKey(actorKey, questionId)
  const client = getRedis()
  if (client) {
    await client.set(key, selectedOption, { nx: true, ex: ATTEMPT_TTL_SECONDS })
    const stored = await client.get<number | string>(key)
    const parsed = Number(stored)
    return Number.isInteger(parsed) ? parsed : selectedOption
  }

  const existing = readMemory(key)
  if (existing !== null) return existing
  memoryAttempts.set(key, {
    selectedOption,
    expiresAt: Date.now() + ATTEMPT_TTL_SECONDS * 1000,
  })
  return selectedOption
}

export async function getFirstQuestionAttempt(
  actorKey: string,
  questionId: string,
): Promise<number | null> {
  const key = attemptKey(actorKey, questionId)
  const client = getRedis()
  if (client) {
    const stored = await client.get<number | string>(key)
    if (stored === null) return null
    const parsed = Number(stored)
    return Number.isInteger(parsed) ? parsed : null
  }
  return readMemory(key)
}

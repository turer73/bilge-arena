import 'server-only'
import { createHash, createHmac } from 'node:crypto'

function networkPrefix(headers: Headers): string | null {
  const raw = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || headers.get('x-real-ip')?.trim()
  if (!raw) return null
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(raw)) return raw.split('.').slice(0, 3).join('.')
  if (raw.includes(':')) return raw.split(':').slice(0, 4).join(':')
  return null
}

/** Opaque risk-cluster evidence; raw network data is never persisted. */
export function questionQualityIndependenceKey(userId: string, headers: Headers): string {
  const secret = process.env.QUESTION_QUALITY_INDEPENDENCE_SECRET?.trim()
  const riskCluster = networkPrefix(headers)
  if (secret && riskCluster) {
    return createHmac('sha256', secret).update(`question-quality-risk|${riskCluster}`).digest('hex')
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('question_quality_independence_signal_unavailable')
  }
  return createHash('sha256').update(`question-quality-local-fallback|${userId}`).digest('hex')
}

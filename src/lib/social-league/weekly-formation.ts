import { createHash } from 'node:crypto'
import { TR_TIME_ZONE } from '@/lib/utils/tr-date'

function dateString(year: number, month: number, day: number): string {
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-')
}

export function getIstanbulWeekStart(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TR_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const year = Number(values.year)
  const month = Number(values.month)
  const day = Number(values.day)
  const localDate = new Date(Date.UTC(year, month - 1, day))
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7
  localDate.setUTCDate(localDate.getUTCDate() - daysSinceMonday)
  return dateString(
    localDate.getUTCFullYear(),
    localDate.getUTCMonth() + 1,
    localDate.getUTCDate(),
  )
}

export function formationRequestId(weekStart: string): string {
  const bytes = createHash('sha256')
    .update(`bilge-arena:weekly-learning-league:${weekStart}`)
    .digest()
    .subarray(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

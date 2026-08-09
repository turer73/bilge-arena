const istanbulFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export function formatIstanbulDateTime(value: string): string {
  return `${istanbulFormatter.format(new Date(value))} (İstanbul)`
}

const ISTANBUL_UTC_OFFSET_MS = 3 * 60 * 60 * 1000

export function toIstanbulDateTimeInput(date: Date): string {
  return new Date(date.getTime() + ISTANBUL_UTC_OFFSET_MS).toISOString().slice(0, 16)
}

export function istanbulDateTimeInputToIso(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [, year, month, day, hour, minute] = match
  const timestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  ) - ISTANBUL_UTC_OFFSET_MS
  const date = new Date(timestamp)
  return toIstanbulDateTimeInput(date) === value ? date.toISOString() : null
}

export const assignmentStatusLabels = {
  active: 'Teslime açık',
  upcoming: 'Yakında açılacak',
  submitted: 'Teslim edildi',
  expired: 'Süresi doldu',
  closed: 'Kapatıldı',
  cancelled: 'İptal edildi',
} as const

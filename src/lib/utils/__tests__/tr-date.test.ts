import { describe, it, expect } from 'vitest'
import { trDayString, trYesterdayString, trDayStartUtcISO } from '../tr-date'

describe('tr-date (Europe/Istanbul, UTC+3)', () => {
  it('gece TR 01:00 (UTC 22:00 onceki gun) TR takvim gunu = ertesi gun', () => {
    // 2026-07-05 22:00 UTC = 2026-07-06 01:00 TR
    const d = new Date('2026-07-05T22:00:00.000Z')
    expect(trDayString(d)).toBe('2026-07-06')
  })

  it('gunduz TR 10:00 ayni takvim gunu', () => {
    // 2026-07-06 07:00 UTC = 2026-07-06 10:00 TR
    const d = new Date('2026-07-06T07:00:00.000Z')
    expect(trDayString(d)).toBe('2026-07-06')
  })

  it('DOUBLE-CLAIM regresyonu: gece 01:00 ve ayni gun 10:00 AYNI TR gunu', () => {
    // Denetim bulgusu: UTC ile bu ikisi farkli gun sayilip ikinci odul veriyordu.
    const gece = new Date('2026-07-05T22:00:00.000Z')   // TR 2026-07-06 01:00
    const gunduz = new Date('2026-07-06T07:00:00.000Z') // TR 2026-07-06 10:00
    expect(trDayString(gece)).toBe(trDayString(gunduz))
  })

  it('trYesterdayString bir onceki TR gunu', () => {
    const d = new Date('2026-07-06T07:00:00.000Z') // TR 2026-07-06
    expect(trYesterdayString(d)).toBe('2026-07-05')
  })

  it('trDayStartUtcISO TR gun basini UTC olarak dondurur (D-1 21:00 UTC)', () => {
    const d = new Date('2026-07-06T07:00:00.000Z') // TR 2026-07-06
    // TR 2026-07-06 00:00 +03:00 = 2026-07-05 21:00 UTC
    expect(trDayStartUtcISO(d)).toBe('2026-07-05T21:00:00.000Z')
  })
})

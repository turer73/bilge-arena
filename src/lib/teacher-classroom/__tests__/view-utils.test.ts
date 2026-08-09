import { describe, expect, it } from 'vitest'
import {
  formatIstanbulDateTime,
  istanbulDateTimeInputToIso,
  toIstanbulDateTimeInput,
} from '../view-utils'

describe('teacher classroom Istanbul date helpers', () => {
  it('round-trips datetime-local values using Istanbul UTC+3 instead of the device zone', () => {
    const instant = new Date('2026-08-09T10:15:00.000Z')

    expect(toIstanbulDateTimeInput(instant)).toBe('2026-08-09T13:15')
    expect(istanbulDateTimeInputToIso('2026-08-09T13:15')).toBe('2026-08-09T10:15:00.000Z')
    expect(formatIstanbulDateTime(instant.toISOString())).toContain('(İstanbul)')
  })

  it('rejects malformed and impossible local timestamps', () => {
    expect(istanbulDateTimeInputToIso('2026-02-30T10:00')).toBeNull()
    expect(istanbulDateTimeInputToIso('2026-08-09 13:15')).toBeNull()
  })
})

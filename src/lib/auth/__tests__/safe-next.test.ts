import { describe, expect, it } from 'vitest'
import { safeAuthNext } from '../safe-next'

describe('safeAuthNext', () => {
  it('keeps safe relative application paths', () => {
    expect(safeAuthNext('/arena/kurum/roller')).toBe('/arena/kurum/roller')
  })

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', null])(
    'rejects unsafe destination %s',
    (value) => {
      expect(safeAuthNext(value)).toBe('/arena')
    },
  )
})

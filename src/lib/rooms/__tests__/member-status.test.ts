import { describe, it, expect } from 'vitest'
import { isActiveMember, isScoreboardMember } from '../member-status'

const ENDED = '2026-10-18T10:00:00Z'

describe('isActiveMember', () => {
  it('room_members.is_active alanini izler', () => {
    expect(isActiveMember({ is_active: true })).toBe(true)
    expect(isActiveMember({ is_active: false })).toBe(false)
  })

  it('alan gelmemisse aktif sayar (eski payload)', () => {
    expect(isActiveMember({})).toBe(true)
  })
})

describe('isScoreboardMember', () => {
  it('aktif uye tabloda', () => {
    expect(isScoreboardMember({ is_active: true, left_at: null }, ENDED)).toBe(true)
  })

  it('oyun bitmeden atilan ya da ayrilan uye tablodan cikar', () => {
    expect(
      isScoreboardMember({ is_active: false, left_at: '2026-10-18T09:59:00Z' }, ENDED),
    ).toBe(false)
  })

  it('oyun bittikten sonra ayrilan uye tabloda kalir', () => {
    expect(
      isScoreboardMember({ is_active: false, left_at: '2026-10-18T10:05:00Z' }, ENDED),
    ).toBe(true)
  })

  it('oda bitmemisken (reveal) pasif uye cikar', () => {
    expect(
      isScoreboardMember({ is_active: false, left_at: '2026-10-18T09:59:00Z' }, null),
    ).toBe(false)
  })
})

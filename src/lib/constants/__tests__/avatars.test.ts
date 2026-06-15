/**
 * avatars.ts — Bilge Chan maskot + DiceBear preset birleşik katalog.
 * avatarPath webp(mascot)+svg(preset) çözer; AVATAR_GROUPS Bilge Chan ilk.
 */

import { describe, it, expect } from 'vitest'
import { MASCOT_AVATARS, ALL_AVATARS, avatarPath, AVATAR_GROUPS } from '../avatars'
import { PRESET_AVATARS } from '../preset-avatars'

describe('avatars katalog', () => {
  it('MASCOT_AVATARS: webp path, benzersiz id, bilinen gruplar', () => {
    expect(MASCOT_AVATARS.length).toBeGreaterThanOrEqual(10)
    const ids = MASCOT_AVATARS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const a of MASCOT_AVATARS) {
      expect(['Bilge Chan', 'Karakterler']).toContain(a.label)
      expect(a.path).toMatch(/^\/avatars\/mascot\/.+\.webp$/)
    }
  })

  it('ALL_AVATARS = mascot + preset, mascot önce', () => {
    expect(ALL_AVATARS.length).toBe(MASCOT_AVATARS.length + PRESET_AVATARS.length)
    expect(ALL_AVATARS[0].label).toBe('Bilge Chan')
  })

  it('avatarPath: mascot webp + DiceBear svg çözer, geçersiz/enjeksiyon null', () => {
    expect(avatarPath('chan-3d-smile')).toBe('/avatars/mascot/chan-avatar-3d-smile.webp')
    expect(avatarPath(PRESET_AVATARS[0].id)).toBe(PRESET_AVATARS[0].path)
    expect(avatarPath('../../etc/passwd')).toBeNull()
    expect(avatarPath('yok')).toBeNull()
  })

  it('AVATAR_GROUPS: Bilge Chan + Karakterler ilk iki grup, label benzersiz', () => {
    expect(AVATAR_GROUPS[0].label).toBe('Bilge Chan')
    expect(AVATAR_GROUPS[0].items.length).toBe(6)
    expect(AVATAR_GROUPS[1].label).toBe('Karakterler')
    expect(AVATAR_GROUPS[1].items.length).toBe(4)
    const labels = AVATAR_GROUPS.map((g) => g.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})

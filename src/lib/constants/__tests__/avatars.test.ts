/**
 * avatars.ts — Bilge Chan maskot + DiceBear preset birleşik katalog.
 * avatarPath webp(mascot)+svg(preset) çözer; AVATAR_GROUPS Bilge Chan ilk.
 */

import { describe, it, expect } from 'vitest'
import { MASCOT_AVATARS, ALL_AVATARS, avatarPath, AVATAR_GROUPS, avatarMinLevel } from '../avatars'
import { PRESET_AVATARS } from '../preset-avatars'

describe('avatars katalog', () => {
  it('MASCOT_AVATARS: webp path, benzersiz id, bilinen gruplar', () => {
    expect(MASCOT_AVATARS.length).toBeGreaterThanOrEqual(21)
    const ids = MASCOT_AVATARS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    const KNOWN = ['Bilge Chan', 'Karakterler', 'Hayvanlar', 'Fantastik', 'Arketipler', 'Anime']
    for (const a of MASCOT_AVATARS) {
      expect(KNOWN).toContain(a.label)
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

  it('AVATAR_GROUPS: mascot grupları sırayla + label benzersiz', () => {
    const expected: [string, number][] = [
      ['Bilge Chan', 6],
      ['Karakterler', 4],
      ['Hayvanlar', 4],
      ['Fantastik', 3],
      ['Arketipler', 2],
      ['Anime', 2],
    ]
    expected.forEach(([label, count], i) => {
      expect(AVATAR_GROUPS[i].label).toBe(label)
      expect(AVATAR_GROUPS[i].items.length).toBe(count)
    })
    const labels = AVATAR_GROUPS.map((g) => g.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('avatarMinLevel: rarity eşikleri (default 1, prestij yüksek)', () => {
    expect(avatarMinLevel('chan-3d-smile')).toBe(1) // common
    expect(avatarMinLevel(PRESET_AVATARS[0].id)).toBe(1) // DiceBear açık
    expect(avatarMinLevel('chan-fairy')).toBe(5) // en nadir
    expect(avatarMinLevel('chan-wizard')).toBe(4)
    expect(avatarMinLevel('yok')).toBe(1)
  })
})

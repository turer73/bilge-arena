import { describe, it, expect, beforeEach, vi } from 'vitest'
import { toggleSound, getSoundEnabled } from '../sounds'

const store: Record<string, string> = {}

beforeEach(() => {
  Object.keys(store).forEach(key => delete store[key])

  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
  })
})

describe('getSoundEnabled', () => {
  it('varsayilan olarak acik olmali', () => {
    // localStorage'da 'off' yoksa ses acik
    expect(getSoundEnabled()).toBe(true)
  })

  it('off iken false dondurmeli', () => {
    store['bilge-sound'] = 'off'
    expect(getSoundEnabled()).toBe(false)
  })

  it('on iken true dondurmeli', () => {
    store['bilge-sound'] = 'on'
    expect(getSoundEnabled()).toBe(true)
  })
})

describe('toggleSound', () => {
  it('acikken kapatmali', () => {
    // Varsayilan acik (off yok)
    const result = toggleSound()
    expect(result).toBe(false) // kapatildi
    expect(store['bilge-sound']).toBe('off')
  })

  it('kapaliyken acmali', () => {
    store['bilge-sound'] = 'off'
    const result = toggleSound()
    expect(result).toBe(true) // acildi
    expect(store['bilge-sound']).toBe('on')
  })

  it('art arda toggle dogru calismali', () => {
    // acik → kapat
    expect(toggleSound()).toBe(false)
    // kapali → ac
    expect(toggleSound()).toBe(true)
    // acik → kapat
    expect(toggleSound()).toBe(false)
  })
})

/**
 * Bilge Arena Oda: categories.ts unit tests
 * Sprint 2A Task 3 Codex fix (PR #61 follow-up)
 */

import { describe, it, expect } from 'vitest'
import {
  ROOM_CATEGORIES,
  CATEGORY_LABELS,
  slugToLabel,
  isValidCategory,
} from '../categories'

describe('ROOM_CATEGORIES', () => {
  it('10 kategori (UI dropdown ile uyumlu)', () => {
    expect(ROOM_CATEGORIES).toHaveLength(10)
  })

  it('CATEGORY_LABELS tum kategoriler icin label saglar', () => {
    for (const slug of ROOM_CATEGORIES) {
      expect(CATEGORY_LABELS[slug]).toBeDefined()
      expect(CATEGORY_LABELS[slug].length).toBeGreaterThan(0)
    }
  })
})

describe('slugToLabel', () => {
  it('genel-kultur → Genel Kültür', () => {
    expect(slugToLabel('genel-kultur')).toBe('Genel Kültür')
  })

  it('matematik → Matematik', () => {
    expect(slugToLabel('matematik')).toBe('Matematik')
  })

  it('cografya → Coğrafya (TR diakritik)', () => {
    expect(slugToLabel('cografya')).toBe('Coğrafya')
  })

  it('vatandaslik → Vatandaşlık (TR diakritik)', () => {
    expect(slugToLabel('vatandaslik')).toBe('Vatandaşlık')
  })

  it('bilinmeyen slug → fallback raw', () => {
    expect(slugToLabel('xx_unknown')).toBe('xx_unknown')
    expect(slugToLabel('')).toBe('')
  })
})

describe('isValidCategory', () => {
  it('whitelist kategoriler true', () => {
    expect(isValidCategory('matematik')).toBe(true)
    expect(isValidCategory('genel-kultur')).toBe(true)
    expect(isValidCategory('sinema')).toBe(true)
  })

  it('whitelist disi false', () => {
    expect(isValidCategory('matematik-eski')).toBe(false)
    expect(isValidCategory('')).toBe(false)
    expect(isValidCategory('xx_unknown')).toBe(false)
  })
})

/**
 * Bilge Arena: resolveOwnedSelection — kozmetik sahiplik guard'ı.
 * Codex P2 regression (PR #193): localStorage'a elle yazılan paid-id
 * satın alma atlatamaz.
 */

import { describe, test, expect } from 'vitest'
import { resolveOwnedSelection } from '../owned-selection'

const CATALOG = [
  { id: 'none' },
  { id: 'bedava' },
  { id: 'paral', coinCost: 400 },
  { id: 'pahali', coinCost: 1500 },
]

describe('resolveOwnedSelection', () => {
  test('ücretsiz öğe sahiplik listesine bakılmadan kullanılabilir', () => {
    expect(resolveOwnedSelection('bedava', [], CATALOG).id).toBe('bedava')
    expect(resolveOwnedSelection('bedava', null, CATALOG).id).toBe('bedava')
  })

  test('sahip olunan ücretli öğe kullanılabilir', () => {
    expect(resolveOwnedSelection('paral', ['none', 'paral'], CATALOG).id).toBe('paral')
  })

  test('SAHİP OLUNMAYAN ücretli öğe fallback\'e düşer (bypass regression)', () => {
    expect(resolveOwnedSelection('pahali', ['none', 'paral'], CATALOG).id).toBe('none')
    expect(resolveOwnedSelection('pahali', [], CATALOG).id).toBe('none')
    expect(resolveOwnedSelection('pahali', null, CATALOG).id).toBe('none')
  })

  test('katalogda olmayan id fallback\'e düşer', () => {
    expect(resolveOwnedSelection('hacked-id', ['hacked-id'], CATALOG).id).toBe('none')
  })

  test('özel fallback id kullanılabilir', () => {
    expect(resolveOwnedSelection('pahali', [], CATALOG, 'bedava').id).toBe('bedava')
  })
})

/**
 * Bilge Arena: filterPlayableCached — offline cache okuma filtresi.
 * Codex P2 regression: toPublicQuestion whitelist'i is_active alanını
 * düşürdüğünden, sanitize edilmiş (is_active=undefined) girdiler
 * ELENMEMELİ; yalnızca açıkça false olanlar (deaktive soru) elenmeli.
 */

import { describe, test, expect } from 'vitest'
import { filterPlayableCached } from '../question-cache'
import type { Question } from '@/types/database'

const q = (over: Record<string, unknown>): Question =>
  ({ id: 'x', game: 'matematik', category: 'cebir', difficulty: 2, content: {}, ...over }) as unknown as Question

describe('filterPlayableCached', () => {
  test('sanitize edilmiş girdi (is_active alanı YOK) oynanabilir — P2 regression', () => {
    const rows = [q({ id: 'new-api' })] // toPublicQuestion çıktısı: is_active yok
    expect(filterPlayableCached(rows)).toHaveLength(1)
  })

  test('eski tam-satır girdide is_active=false elenir, true kalır', () => {
    const rows = [q({ id: 'aktif', is_active: true }), q({ id: 'pasif', is_active: false })]
    const out = filterPlayableCached(rows)
    expect(out.map(r => r.id)).toEqual(['aktif'])
  })

  test('kategori filtresi uygulanır', () => {
    const rows = [q({ id: 'a', category: 'cebir' }), q({ id: 'b', category: 'geometri' })]
    expect(filterPlayableCached(rows, 'geometri').map(r => r.id)).toEqual(['b'])
  })

  test('zorluk filtresi uygulanır; null filtreler atlanır', () => {
    const rows = [q({ id: 'a', difficulty: 2 }), q({ id: 'b', difficulty: 5 })]
    expect(filterPlayableCached(rows, null, 5).map(r => r.id)).toEqual(['b'])
    expect(filterPlayableCached(rows, null, null)).toHaveLength(2)
  })
})

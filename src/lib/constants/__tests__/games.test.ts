import { describe, it, expect } from 'vitest'
import { GAMES, CATEGORY_LABELS, GAME_SLUGS, getCategoryLabel } from '../games'

/**
 * Games sabitleri kontrat testi
 * --------------------------------------------------------------
 * Bu test, GAMES[*].categories ve CATEGORY_LABELS arasındaki tutarlılık
 * boşluklarını yakalamak için yazılmıştır. 2026-04-26'da `sosyal/sosyoloji`
 * DB'de mevcut iken `GAMES.sosyal.categories` listesinde olmadığı tespit
 * edildi; admin AI üreticisi ve UI dropdown sosyoloji'yi göremiyordu.
 *
 * Bu testler yeni kategori eklenmesi veya silinmesi durumunda CI'de
 * uyarı verir; build'i kırmadan sessiz drift olmaz.
 */
describe('games sabitleri kontratları', () => {
  it('her oyunun kategori listesi boş değildir', () => {
    for (const slug of GAME_SLUGS) {
      const def = GAMES[slug]
      expect(def.categories.length, `${slug} kategori listesi boş olmamalı`).toBeGreaterThan(0)
    }
  })

  it('GAMES[*].categories içindeki her slug CATEGORY_LABELS içinde tanımlıdır', () => {
    const missing: string[] = []
    for (const slug of GAME_SLUGS) {
      for (const cat of GAMES[slug].categories) {
        if (!(cat in CATEGORY_LABELS)) {
          missing.push(`${slug}/${cat}`)
        }
      }
    }
    expect(missing, 'CATEGORY_LABELS içinde label tanımı eksik').toEqual([])
  })

  it('getCategoryLabel bilinen slug için CATEGORY_LABELS değerini döndürür', () => {
    expect(getCategoryLabel('sosyoloji')).toBe('Sosyoloji')
    expect(getCategoryLabel('paragraf')).toBe('Paragraf')
  })

  it('getCategoryLabel bilinmeyen slug için fallback yapar', () => {
    // Underscore'u boşluğa çevirir, ilk harf büyük
    expect(getCategoryLabel('test_case')).toBe('Test case')
    expect(getCategoryLabel('foo')).toBe('Foo')
  })

  it('sosyoloji kategorisi sosyal oyunda yer alır (regresyon testi)', () => {
    // 2026-04-26: DB'de 13 sosyoloji sorusu vardı ama AI generator topic listesi
    // bu kategoriye sahip değildi; yeni eklenen sosyoloji kategorisinin sürdürülmesi.
    expect(GAMES.sosyal.categories).toContain('sosyoloji')
    expect(CATEGORY_LABELS.sosyoloji).toBe('Sosyoloji')
  })
})

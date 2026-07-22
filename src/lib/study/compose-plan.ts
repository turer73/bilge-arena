/**
 * Saf mixer: FSRS-due + zayif-kategori + yeni soru havuzlarindan tek sirali,
 * benzersiz soru-id listesi uretir ("Bugunun 15'i" gunluk plan).
 *
 * Karma oran (varsayilan size=15): 6 due + 4 zayif-kategori + 5 yeni,
 * KADEMELI DOLDURMA — herhangi bir kova (due/zayif) eksik kalirsa acik kalan
 * slotlar "yeni" havuzuna devrolur (plan hep `size` hedefler, "yeni" havuzu
 * da tukenmisse daha az doner). Kovalar birbirine + kendi icinde dedup edilir.
 *
 * Sira onemli: due -> weak -> new (kullaniciya once tekrar zamani gelenler,
 * sonra zayif oldugu konular, en sonda yeni sorular gosterilir).
 */
export interface ComposePlanInput {
  dueIds: string[]
  weakIds: string[]
  newIds: string[]
  size: number
}

// Varsayilan 15'lik plan orani (S6, Tartisma Platformu konu#7): 6 due + 4 weak + 5 new.
const DUE_RATIO = 6 / 15
const WEAK_RATIO = 4 / 15

export function composePlan({ dueIds, weakIds, newIds, size }: ComposePlanInput): string[] {
  const dueQuota = Math.round(size * DUE_RATIO)
  const weakQuota = Math.round(size * WEAK_RATIO)

  const used = new Set<string>()
  const result: string[] = []

  function takeUpTo(pool: string[], quota: number): void {
    let taken = 0
    for (const id of pool) {
      if (taken >= quota) break
      if (used.has(id)) continue
      used.add(id)
      result.push(id)
      taken++
    }
  }

  takeUpTo(dueIds, dueQuota)
  takeUpTo(weakIds, weakQuota)
  // Kademeli doldurma: due/weak kovalarinda acik kalan TUM slotlar (kendi
  // kovalarinin acigini da icerir) "yeni" havuzundan doldurulur.
  takeUpTo(newIds, size - result.length)

  return result.slice(0, size)
}

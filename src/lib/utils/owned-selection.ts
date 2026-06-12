/**
 * Mağaza seçim guard'ı (Codex P2, PR #193): localStorage'dan gelen kozmetik
 * seçimi (arka plan / çerçeve) SAHİPLİK listesine karşı doğrular.
 *
 * localStorage kullanıcı kontrolünde — elle paid-id yazılarak satın alma
 * atlanabilirdi. Kural: ücretsiz öğeler (coinCost undefined) herkese açık;
 * ücretliler yalnızca owned listesindeyse; aksi halde fallback'e düş.
 */

interface OwnableItem {
  id: string
  coinCost?: number
}

export function resolveOwnedSelection<T extends OwnableItem>(
  selectedId: string,
  owned: readonly string[] | null | undefined,
  catalog: readonly T[],
  fallbackId = 'none',
): T {
  const fallback = catalog.find((i) => i.id === fallbackId) ?? catalog[0]
  const item = catalog.find((i) => i.id === selectedId)
  if (!item) return fallback
  if (item.coinCost === undefined) return item
  if ((owned ?? []).includes(item.id)) return item
  return fallback
}

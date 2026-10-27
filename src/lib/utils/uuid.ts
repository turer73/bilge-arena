/**
 * UUID v4 RFC 4122 strict pattern.
 *
 * Klipper engineering review (Note #108 P1): farkli endpoint'lerde eskiden
 * /^[0-9a-f-]{36}$/i kullaniliyordu — bu, dash konumlari yanlis stringleri
 * de yakalar (ornek: '---------abc123def456abc123def456abc1'). PostgreSQL
 * uuid[] cast 22P02 'invalid input syntax' atar, endpoint 500 doner ve mini-DoS
 * vektoru olusur.
 *
 * Bu helper tutarli strict UUID dogrulamasi saglar; tum API route'larda ve
 * client UUID validation'larinda import edilerek kullanilmali.
 *
 * Pattern: 8-4-4-4-12 hex digit grup (uppercase ve lowercase).
 */
export const UUID_STRICT_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Tek bir string'in UUID v4 formatinda olup olmadigini dogrular.
 */
export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_STRICT_PATTERN.test(value)
}

/**
 * Gecerli UUID'yi kanonik (kucuk harf, tireli) bicime indirir; degilse null.
 *
 * PostgreSQL uuid girdisinde buyuk harf, tiresiz ve {...} yazimlarini ayni
 * deger sayar. Bir UUID metin (TEXT) anahtar olarak saklaniyorsa bu yazimlar
 * ayri kayit olur; ornegin oda istatistigi tekrar korumasi bu yolla delinir
 * (multiplayer_room_stats_log). Metin anahtara yazmadan once bunu kullan.
 */
export function canonicalUuid(value: unknown): string | null {
  return isValidUuid(value) ? value.toLowerCase() : null
}

/**
 * Bir array'den gecerli UUID'leri filtrele (maksimum N), case-insensitive.
 * Sayi sinirlamasi uuid[] PostgreSQL perf icin onerilir (default 50).
 */
export function filterValidUuids(values: unknown[], max = 50): string[] {
  const result: string[] = []
  for (const v of values) {
    if (isValidUuid(v)) result.push(v)
    if (result.length >= max) break
  }
  return result
}

/**
 * Turkce-locale metin yardimcilari — I/i, İ/ı matrix problemine kalici cozum.
 *
 * NEDEN: JavaScript'in varsayilan .toLowerCase()/.toUpperCase() methodlari
 * "I".toLowerCase() -> "i" (yanlis, Turkce "ı" olmali) gibi hatali sonuclar uretir.
 * Email normalizasyonu, arama, slug olusturma gibi kullanici girisini isleyen
 * her yerde bu helper'lar kullanilmalidir.
 *
 * Turkce case katlama:
 *   I (U+0049) ↔ ı (U+0131)    (noktasiz)
 *   İ (U+0130) ↔ i (U+0069)    (noktali)
 *
 * Kullanim:
 *   trLower("İSTANBUL")  → "istanbul"
 *   trLower("IŞIK")      → "ışık"
 *   trUpper("merhaba")   → "MERHABA"
 *   trUpper("istanbul")  → "İSTANBUL"
 *   trCompare("özkan", "Özkan") → 0  (esit, buyuk/kucuk farketmez)
 *   trIncludes("Merhaba Dünya", "dünya") → true
 *   trSlug("Ördek Yavrusu") → "ordek-yavrusu"
 *
 * Referans: src/lib/validations/tdk-rules.fixture.ts
 */

const LOCALE = 'tr-TR'

/**
 * Turkce-locale kucuk harf. JavaScript default yerine bunu kullan.
 */
export function trLower(input: string): string {
  return input.toLocaleLowerCase(LOCALE)
}

/**
 * Turkce-locale buyuk harf.
 */
export function trUpper(input: string): string {
  return input.toLocaleUpperCase(LOCALE)
}

/**
 * Turkce-locale karsilastirma. Buyuk/kucuk harf ve diakritik duyarsiz.
 *
 * Donus: < 0 eger a, b'den once gelirse. 0 eger esitse. > 0 eger a, b'den sonra.
 */
export function trCompare(a: string, b: string): number {
  return a.localeCompare(b, LOCALE, { sensitivity: 'base' })
}

/**
 * Turkce-locale substring kontrolu. Buyuk/kucuk harf duyarsiz.
 * Diakritik (ç, ğ, ı, ö, ş, ü) korunur — "ozkan" "Özkan" ile eslesmez,
 * eslesme istenen durumda unaccent uygula.
 */
export function trIncludes(haystack: string, needle: string): boolean {
  if (!needle) return true
  return trLower(haystack).includes(trLower(needle))
}

/**
 * Turkce karakterleri ASCII muadiline cevir. URL slug, DB lookup icin.
 * KULLANIMI: sadece teknik/URL bagliminda. Kullaniciya gorunen metinde
 * diakritik kaybedilmemeli.
 */
export function trDeaccent(input: string): string {
  return input
    .replace(/Ç/g, 'C').replace(/ç/g, 'c')
    .replace(/Ğ/g, 'G').replace(/ğ/g, 'g')
    .replace(/İ/g, 'I').replace(/ı/g, 'i')
    .replace(/Ö/g, 'O').replace(/ö/g, 'o')
    .replace(/Ş/g, 'S').replace(/ş/g, 's')
    .replace(/Ü/g, 'U').replace(/ü/g, 'u')
}

/**
 * URL slug uretir. Turkce karakter ASCII'ye, bosluk -'ye, alfanumerik di siler.
 *
 * Ornek:
 *   trSlug("Ördek Yavrusu") → "ordek-yavrusu"
 *   trSlug("İstanbul 2026") → "istanbul-2026"
 */
export function trSlug(input: string): string {
  return trDeaccent(input)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Unaccent + trLower. Accent-insensitive arama icin.
 *
 * Ornek:
 *   trNormalize("Özkan") === trNormalize("ozkan") // true
 *
 * DIKKAT: Bu server-side aramada yerine getirmez — DB-level unaccent
 * extension kullan (026 migration). Client-side hizli prefix-match icin uygun.
 */
export function trNormalize(input: string): string {
  return trDeaccent(trLower(input))
}

/**
 * Heuristic: metnin muhtemelen Turkce olup olmadigini doner.
 *
 * NEDEN: AI uretim akisinda (`/api/admin/generate-questions`) prompt drift
 * sonucu wordquest C2 cozumleri Ingilizce uretildi (Apr 2026 production gozlemi).
 * Bu helper drift'i runtime'da yakalamak icin kullanilir — Zod sonrasi her
 * wordquest solution'i bu fonksiyondan gecirilir, false donerse satir filtrelenir.
 *
 * Heuristic kararlari (false-positive > false-negative maliyetine optimize):
 *   - Cok kisa metin (< 30 char): emin olunamaz, lenient kabul (true).
 *     Ornek: "elated = mutlu" (18 char) -> true (kisa Turkce'yi reddetme).
 *   - Turkce-spesifik karakter (ç, ğ, ı, ö, ş, ü) varsa: kuvvetli sinyal, true.
 *   - Cumle baginda Turkce stopword (bir, bu, ve, ile, kelime, anlam) varsa: true.
 *   - Aksi halde uzun metinde sinyal yok -> false (muhtemelen Ingilizce).
 *
 * Word-boundary (\b) ile false-positive engellenir:
 *   - "every" icinde "ve" var, eslesmez (\bve\b).
 *   - "bird" icinde "bir" var, eslesmez (\bbir\b).
 *
 * NOT: Bu fonksiyon dogal dil tespiti yapmaz — sadece Turkce-Ingilizce ayrimi
 * icin tasarlanmistir. Diger dilleri (Almanca, Fransizca vb.) yanlis kabul edebilir.
 */
export function isLikelyTurkish(input: string): boolean {
  const text = (input ?? '').trim()
  if (text.length === 0) return false
  // Cok kisa metinde guvenilir tespit yok — lenient
  if (text.length < 30) return true

  // Strong signal: Turkce-spesifik karakterler. Ingilizce metinde gecmez.
  if (/[çğıöşüÇĞİÖŞÜ]/.test(text)) return true

  // Secondary signal: ASCII-only Turkce stopword/connector eslesmesi.
  // Word-boundary (\b) ile substring false-positive engellenir.
  const turkishMarkers = /\b(bir|bu|ve|ile|olan|olarak|kelime|anlam|gelir|veya|degil|sunlar|nedir|cok|ozellikle)\b/i
  return turkishMarkers.test(text)
}

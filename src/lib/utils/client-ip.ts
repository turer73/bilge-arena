/**
 * Trusted client IP extraction (anti-XFF-spoof helper)
 *
 * Pentest review (PR #75 MEDIUM): split(',')[0] = en soldaki XFF entry =
 * client-controlled. Saldirgan `X-Forwarded-For: 1.2.3.4, 5.6.7.8`
 * gondererek her istekte rate limit key'ini degistirip limiti sifirlayabilir.
 *
 * Trust order (Bilge Arena prod = Cloudflare -> Vercel zinciri):
 *   1. cf-connecting-ip — Cloudflare Edge gercek client IP'sini buraya set
 *      eder (spoof edilemez, CF her zaman uzerine yazar)
 *   2. x-real-ip — bazi proxy'ler ekler (Vercel/CF zincirinde fallback)
 *   3. x-forwarded-for rightmost — XFF chain en sagdaki = en yakin proxy =
 *      trusted hop (en soldaki client-controlled)
 *
 * Headers'in **hicbiri** yoksa 'unknown' doner — rate limiter ayni IP
 * gibi davranir (over-restrictive yerine over-permissive degil — guvenli).
 */
export function getClientIp(headers: Headers): string {
  // 1. Cloudflare trusted header (production'da en guvenilir)
  const cfIp = headers.get('cf-connecting-ip')?.trim()
  if (cfIp) return cfIp

  // 2. x-real-ip fallback
  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  // 3. XFF rightmost (en yakin trusted proxy hop)
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const parts = xff.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length > 0) {
      return parts[parts.length - 1]
    }
  }

  return 'unknown'
}

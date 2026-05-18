/**
 * CSRF Origin/Referer allowlist (klipper review H1/P5).
 *
 * Defense-in-depth: SameSite=Lax cookie zaten cross-origin POST'lardan korur,
 * ama samesite ayarinin yanlislikla degisme riski var (Supabase client config
 * update, Next.js degisikligi). Bu helper state-changing endpoint'lerde
 * Origin/Referer header'lari dogrulayip beyaz liste disindaki istekleri reddeder.
 *
 * Allowlist:
 *   - https://bilgearena.com
 *   - https://www.bilgearena.com
 *   - bilge-arena-<hash>-turgut-7032s-projects.vercel.app (Vercel preview, our team)
 *   - localhost / 127.0.0.1 (local dev)
 *
 * Auth callback'leri (Supabase OAuth redirect) hicbir Origin header iletmez,
 * cagri site disinda baslar; bunlari middleware'de istisna olarak handle et.
 */

const CSRF_STATIC_ALLOWED = new Set([
  'https://bilgearena.com',
  'https://www.bilgearena.com',
])

// Vercel team slug — sadece bu suffix ile biten preview/deploy URL'leri kabul.
// Saldirgan farkli Vercel hesabinda 'bilge-arena-evil' adli proje acsa bile
// suffix kendi team slug'i olur, bizimkiyle eslesmez -> reject.
// (turgut-7032s-projects: Vercel hobby team owner = turgut.urer@gmail.com)
const VERCEL_TEAM_SUFFIX = '-turgut-7032s-projects.vercel.app'

function isDynamicAllowed(originValue: string | null): boolean {
  if (!originValue) return false
  try {
    const u = new URL(originValue.startsWith('http') ? originValue : `https://${originValue}`)
    // Local dev
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true
    // Vercel preview: hem proje prefix hem team suffix gerekli.
    // - 'bilge-arena-' (trailing dash) -> bilge-arenax tip projeleri reject
    // - VERCEL_TEAM_SUFFIX -> bilge-arena-evil baska team altinda reject
    if (
      u.hostname.startsWith('bilge-arena-') &&
      u.hostname.endsWith(VERCEL_TEAM_SUFFIX)
    ) {
      return true
    }
    return false
  } catch {
    return false
  }
}

/**
 * Origin VEYA Referer header'inin beyaz listede olup olmadigini kontrol eder.
 * Header yoksa (browser baska bir tab'dan curl gibi) false doner.
 */
export function isCsrfOriginAllowed(headers: Headers): boolean {
  const origin = headers.get('origin')
  const referer = headers.get('referer')

  // Statik beyaz liste
  if (origin && CSRF_STATIC_ALLOWED.has(origin)) return true
  if (referer) {
    try {
      const refOrigin = new URL(referer).origin
      if (CSRF_STATIC_ALLOWED.has(refOrigin)) return true
    } catch {
      // Invalid referer
    }
  }

  // Dinamik (preview + localhost)
  return isDynamicAllowed(origin) || isDynamicAllowed(referer)
}

export const CSRF_PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

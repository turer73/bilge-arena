const SENSITIVE_WORKSPACE_PREFIXES = [
  '/admin',
  '/arena/kurum',
  '/arena/sinif',
  '/hesap/guvenlik',
  '/api/admin',
  '/api/institution',
  '/api/teacher',
] as const

function normalizePathname(pathname: string): string {
  const rawPath = pathname.split(/[?#]/, 1)[0] || '/'
  let pathOnly = rawPath
  try {
    // URL.pathname preserves percent escapes. Decode conservatively so an
    // encoded `/admin` or `/arena/kurum` path cannot bypass the privacy gate.
    pathOnly = decodeURIComponent(rawPath)
  } catch {
    // Malformed escapes are not a valid way to opt out of the boundary.
  }
  return pathOnly.length > 1 ? pathOnly.replace(/\/+$/, '') : pathOnly
}

/**
 * Kurum, sinif ve yonetim calisma alanlarinda reklam/analitik/replay yasaktir.
 * Segment siniri kontrolu `/administrator` gibi benzer adlari yanlislikla
 * hassas alan saymamamizi saglar.
 */
export function isSensitiveWorkspacePath(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  return SENSITIVE_WORKSPACE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
  )
}

export function isCurrentBrowserPathSensitive(): boolean {
  return typeof window !== 'undefined'
    && isSensitiveWorkspacePath(window.location.pathname)
}

export function isSensitiveTelemetryUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    return isSensitiveWorkspacePath(new URL(url, 'https://bilgearena.com').pathname)
  } catch {
    return false
  }
}

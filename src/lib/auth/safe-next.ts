export function safeAuthNext(raw: string | null | undefined, fallback = '/arena'): string {
  return typeof raw === 'string'
    && raw.startsWith('/')
    && !raw.startsWith('//')
    && !raw.includes('\\')
    ? raw
    : fallback
}

export const INSTITUTION_SURFACE_PATH = '/arena/kurum'
export const INSTITUTION_NO_ACCESS_PATH = '/hesap/kurum-erisim'

// Personel giris hedefleri: "Kurum Hesabiyla Giris" dugmesi yalniz bu
// yuzeylere giden bir ?next= degerini korur. Ogrenci yuzeyine (ornegin
// /arena/matematik) isaret eden bir next, kurum dugmesinin anlamini bozar.
const STAFF_ENTRY_PREFIXES = [
  INSTITUTION_SURFACE_PATH,
  '/admin',
  '/hesap/guvenlik',
  '/arena/sinif/ogretmen',
] as const

function pathOnly(path: string): string {
  return path.split(/[?#]/, 1)[0] || '/'
}

function matchesPrefix(path: string, prefix: string): boolean {
  const normalized = pathOnly(path)
  return normalized === prefix || normalized.startsWith(`${prefix}/`)
}

export function isInstitutionSurfacePath(path: string | null | undefined): boolean {
  return typeof path === 'string' && matchesPrefix(path, INSTITUTION_SURFACE_PATH)
}

export function isStaffEntryPath(path: string | null | undefined): boolean {
  return typeof path === 'string' && STAFF_ENTRY_PREFIXES.some((prefix) => matchesPrefix(path, prefix))
}

/**
 * Kurum dugmesi icin giris sonrasi hedef. Guvenli ve personel yuzeyine giden
 * bir next (MFA'dan donen ic ice hedef dahil) korunur; diger her durumda
 * kurum paneli hedeflenir.
 */
export function resolveInstitutionLoginNext(raw: string | null | undefined): string {
  const safe = safeAuthNext(raw, INSTITUTION_SURFACE_PATH)
  return isStaffEntryPath(safe) ? safe : INSTITUTION_SURFACE_PATH
}

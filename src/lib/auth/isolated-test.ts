export const ISOLATED_TEST_ORIGIN = 'http://localhost:3137'
export const ISOLATED_PREVIEW_ORIGIN = 'http://localhost:3141'

/**
 * Sentetik Klipper oturumu yalniz yerel gelistirme sunucusunda acilabilir.
 * Bu uc kosuldan biri eksikse test girisi ve onun auth istisnalari kapanir.
 */
export function isIsolatedAcademyTest(): boolean {
  if (process.env.NODE_ENV !== 'development' || process.env.BILGE_ISOLATED_TEST !== 'true') {
    return false
  }
  const expectedSupabaseOrigin = process.env.BILGE_ACADEMY_PREVIEW_BRIDGE === 'true'
    ? ISOLATED_PREVIEW_ORIGIN
    : ISOLATED_TEST_ORIGIN
  return process.env.NEXT_PUBLIC_SUPABASE_URL === expectedSupabaseOrigin
}

/**
 * Yeni arayuz 3141'de calisirken API'ler 3137'deki sentetik veri yiginiyla
 * konusur. 3137 uygulamasinin kendisinde bu kopru kesinlikle acilmaz.
 */
export function isIsolatedAcademyPreviewBridge(): boolean {
  return isIsolatedAcademyTest()
    && process.env.BILGE_ACADEMY_PREVIEW_BRIDGE === 'true'
}

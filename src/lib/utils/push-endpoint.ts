/**
 * Web Push abonelik adresi yalnız tarayıcıların push servislerinden biri
 * olabilir. Hatırlatma cron'u her gün kayıtlı adrese sunucudan POST atıyor;
 * adres istemciden geldiği (ve PostgREST üzerinden doğrudan da yazılabildiği)
 * için bu liste olmadan cron rastgele bir adrese istek atan bir aracıya
 * dönüşebiliyordu (derin inceleme 2026-10-15, §6 kör SSRF).
 *
 * Kaynaklar: Chrome/Opera/Samsung/Brave → FCM, Firefox → Mozilla autopush,
 * Safari → Apple, Edge → WNS.
 */
const EXACT_PUSH_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
])
const PUSH_HOST_SUFFIXES = ['.notify.windows.com']

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false
  const host = url.hostname.toLowerCase()
  return EXACT_PUSH_HOSTS.has(host) || PUSH_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
}

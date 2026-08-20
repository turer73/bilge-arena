import type { Profile } from '@/types/database'

/**
 * Platform personeli mi? `/api/profile` isAdmin'i gerçek admin yüzeyi
 * izinlerinden hesaplar ve applyRole bunu client'ta profile.role='admin' yapar.
 * Kurum/öğretmen pilot rolleri platform personeli sayılmaz. Platform personeli
 * tüm mağaza
 * kozmetiklerini (arka plan, video, çerçeve, nameplate, rozet) satın almadan
 * kullanır — test/personel ayrıcalığı.
 *
 * NOT: Yalnızca kozmetik ücretsizliği içindir; gerçek yetki kontrolü
 * checkPermission (server, user_roles) ile yapılır.
 */
export function isStaff(profile: Profile | null | undefined): boolean {
  return profile?.role === 'admin'
}

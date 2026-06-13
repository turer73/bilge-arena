import type { Profile } from '@/types/database'

/**
 * Personel/rol-sahibi kullanıcı mı? `/api/profile` isAdmin'i user_roles'ta kayıt
 * olup olmadığına bakar (super_admin/editor/moderator/viewer hepsi) ve applyRole
 * bunu client'ta profile.role='admin' yapar. Bu kullanıcılar tüm mağaza
 * kozmetiklerini (arka plan, video, çerçeve, nameplate, rozet) satın almadan
 * kullanır — test/personel ayrıcalığı.
 *
 * NOT: Yalnızca kozmetik ücretsizliği içindir; gerçek yetki kontrolü
 * checkPermission (server, user_roles) ile yapılır.
 */
export function isStaff(profile: Profile | null | undefined): boolean {
  return profile?.role === 'admin'
}

/**
 * Bilge Arena Oda Sistemi: uyelik durumu.
 *
 * room_members'ta "atildi" diye ayri bir alan yok: kick_member ve leave_room
 * ikisi de `is_active = FALSE, left_at = NOW()` yazar
 * (5_rooms_functions_lobby.sql). Istemci bu satiri PostgREST ve
 * postgres_changes uzerinden ham haliyle alir.
 */

import type { Member } from './room-state-reducer'

type MemberActivity = Pick<Member, 'is_active' | 'left_at'>

/** Odada hala oyunda olan uye. Alan gelmemisse (eski payload) aktif sayilir. */
export function isActiveMember(member: Pick<Member, 'is_active'>): boolean {
  return member.is_active !== false
}

/**
 * Skor tablosunda yer alan uye: aktif olanlar ve oyun bittikten sonra
 * odadan ayrilanlar. Oyun bitmeden atilan ya da ayrilan oyuncu cikar
 * (kick completed/archived durumunda zaten yasak).
 */
export function isScoreboardMember(
  member: MemberActivity,
  roomEndedAt: string | null | undefined,
): boolean {
  if (isActiveMember(member)) return true
  if (!member.left_at || !roomEndedAt) return false
  return Date.parse(member.left_at) >= Date.parse(roomEndedAt)
}

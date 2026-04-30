/**
 * Bilge Arena Oda Sistemi: Server-only PostgREST fetch helpers
 * Sprint 1 PR4a Task 2
 *
 * Server component'lardan dogrudan PostgREST'e gidip RLS-filtered data alir.
 * Hata pathlerinde sessiz bos return ([] veya null) — UI'a "Failed to fetch"
 * yansimaz, kullanici sadece bos liste/404 gorur.
 *
 * Why server-only: BILGE_ARENA_RPC_URL env var ve JWT yalnizca server-side
 * okunabilir; client'a leak etmez (server-only import paketi).
 *
 * Hata stratejisi:
 *   - !res.ok (4xx/5xx) → [] | null (RLS empty veya server hata, ayirt etmiyoruz)
 *   - JSON parse fail → [] | null
 *   - Network reject → [] | null
 *
 * Trade-off: gercek 5xx hatasi bos liste gibi gorunur, observability
 * (Sentry vs.) ile ayri yakalanir. Server component'lar Sentry'ye log atar.
 */

import 'server-only'

const RPC_URL =
  process.env.BILGE_ARENA_RPC_URL ?? 'http://127.0.0.1:3001'

// =============================================================================
// Types
// =============================================================================

export type RoomState = 'lobby' | 'in_progress' | 'finished' | 'cancelled'

export type RoomListItem = {
  id: string
  code: string
  title: string
  state: RoomState
  created_at: string
  room_members: Array<{ count: number }>
}

export type RoomDetail = {
  id: string
  code: string
  title: string
  state: RoomState
  category: string
  difficulty: number
  question_count: number
  max_players: number
  per_question_seconds: number
  mode: 'sync' | 'async'
  created_at: string
  host_id: string
}

// =============================================================================
// fetchMyRooms — /oda list page veri kaynagi
// =============================================================================

/**
 * Kullanicinin host veya member oldugu aktif odalari (lobby + in_progress)
 * created_at DESC sirayla doner. RLS otomatik filtreler:
 * `rooms_select_host_or_member` policy host_id veya room_members'e gore filter.
 */
export async function fetchMyRooms(jwt: string): Promise<RoomListItem[]> {
  const url = new URL(`${RPC_URL}/rooms`)
  url.searchParams.set('state', 'in.(lobby,in_progress)')
  url.searchParams.set(
    'select',
    'id,code,title,state,created_at,room_members(count)',
  )
  url.searchParams.set('order', 'created_at.desc')

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: 'no-store',
    })
    if (!res.ok) return []
    return (await res.json()) as RoomListItem[]
  } catch {
    return []
  }
}

// =============================================================================
// fetchRoomByCode — /oda/[code] placeholder veri kaynagi
// =============================================================================

/**
 * Belirli bir kodu olan odayi getirir (limit 1). Member degilse RLS empty
 * doner → null. notFound() trigger eder.
 */
export async function fetchRoomByCode(
  jwt: string,
  code: string,
): Promise<RoomDetail | null> {
  const url = new URL(`${RPC_URL}/rooms`)
  url.searchParams.set('code', `eq.${code}`)
  url.searchParams.set('select', '*')
  url.searchParams.set('limit', '1')

  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${jwt}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const rows = (await res.json()) as RoomDetail[]
    return rows[0] ?? null
  } catch {
    return null
  }
}

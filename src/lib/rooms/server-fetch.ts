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

import type {
  Member,
  Room,
  CurrentRound,
  RoomState as RoomFullState,
} from './room-state-reducer'

const RPC_URL =
  process.env.BILGE_ARENA_RPC_URL ?? 'http://127.0.0.1:3001'

// =============================================================================
// Types
// =============================================================================

/**
 * DB CHECK constraint chk_rooms_state ile birebir (2_rooms.sql:133).
 *
 * Plan-deviation note: PR4a'de yanlislikla 'in_progress'/'finished'/'cancelled'
 * yazilmisti, DB'de YOK. Hot-fix PR4b-5'te dogru enum'la yer degistirildi.
 */
export type RoomLifecycleState =
  | 'lobby'
  | 'active'
  | 'reveal'
  | 'completed'
  | 'archived'

export type RoomListItem = {
  id: string
  code: string
  title: string
  state: RoomLifecycleState
  created_at: string
  room_members: Array<{ count: number }>
}

export type RoomDetail = {
  id: string
  code: string
  title: string
  state: RoomLifecycleState
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

// =============================================================================
// fetchRoomState — /oda/[code] full lobby state SSR + GET /state route
// =============================================================================

/**
 * Oda full state SSR data: room + members + current_round + answers_count.
 * 4 paralel PostgREST query (Promise.all).
 *
 * `online: Set<>` ve `isStale: false` HOOK tarafinda eklenir (presence-derived,
 * channel error sonrasi flag). REST sadece durable schema verisi doner.
 *
 * 4c'de doldurulacak placeholder:
 *   - answers_count: room_answers count (current_round filter)
 *   - scoreboard: room_answers + question correctness aggregate
 *
 * Hata pathleri:
 *   - room yok / RLS empty → null
 *   - members fetch fail → [] (sessiz)
 *   - rounds fetch fail → null current_round (sessiz)
 */
export async function fetchRoomState(
  jwt: string,
  roomId: string,
): Promise<Omit<RoomFullState, 'online' | 'isStale'> | null> {
  const headers = { Authorization: `Bearer ${jwt}` }
  const opts = { headers, cache: 'no-store' as const }

  try {
    // PR4e-2: room_round_question_view (anti-cheat) — soru icerigi + round meta
    // tek query'de doner. revealed_at NULL ise correct_answer/explanation NULL.
    const [roomRes, membersRes, roundRes] = await Promise.all([
      fetch(
        `${RPC_URL}/rooms?id=eq.${roomId}&select=*&limit=1`,
        opts,
      ),
      fetch(
        `${RPC_URL}/room_members?room_id=eq.${roomId}&select=*&order=joined_at.asc`,
        opts,
      ),
      fetch(
        `${RPC_URL}/room_round_question_view?room_id=eq.${roomId}&select=*&order=round_index.desc&limit=1`,
        opts,
      ),
    ])

    if (!roomRes.ok) return null
    const rooms = (await roomRes.json()) as Room[]
    if (rooms.length === 0) return null

    const members = membersRes.ok
      ? ((await membersRes.json()) as Member[])
      : []
    const rounds = roundRes.ok
      ? ((await roundRes.json()) as CurrentRound[])
      : []
    const current_round = rounds[0] ?? null

    // PR4e-5: room_answers count for current round (Prefer: count=exact header)
    let answers_count = 0
    if (current_round?.round_id) {
      const answersRes = await fetch(
        `${RPC_URL}/room_answers?round_id=eq.${current_round.round_id}&select=user_id`,
        {
          ...opts,
          headers: {
            ...opts.headers,
            Prefer: 'count=exact',
          },
        },
      )
      if (answersRes.ok) {
        // PostgREST returns Content-Range: 0-N/total
        const range = answersRes.headers.get('content-range') ?? ''
        const total = parseInt(range.split('/')[1] ?? '0', 10)
        answers_count = Number.isNaN(total) ? 0 : total
      }
    }

    return {
      room: rooms[0],
      members,
      current_round,
      answers_count,
      scoreboard: [], // TODO 4e-6 (full scoreboard with correct_count + tie-breaker)
    }
  } catch {
    return null
  }
}

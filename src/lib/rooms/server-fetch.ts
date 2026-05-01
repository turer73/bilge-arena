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
// PublicRoomCard (Sprint 2A Task 3)
// =============================================================================
/**
 * /oda?tab=public listesinde gosterilen kart. RLS policy
 * rooms_select_public_lobby (TO anon, authenticated) is_public + lobby filter.
 *
 * Codex P1 v2 (PR #61): member_count rooms tablosunda denormalized
 * kolon (trigger ile senkron). Eski room_members(count) embed'i anon icin
 * RLS reddederdi.
 */
export type PublicRoomCard = {
  id: string
  code: string
  title: string
  category: string
  difficulty: number
  question_count: number
  max_players: number
  member_count: number
  created_at: string
}

/**
 * Public lobby odalarini listeler. Anonim user (JWT yok) ve authenticated
 * her ikisi de cagiribilir — RLS policy + GRANT SELECT TO anon ile.
 *
 * Kategori filter optional. Default 20 oda max (created_at DESC).
 */
export async function fetchPublicRooms(
  jwt: string | null,
  opts?: { category?: string; limit?: number },
): Promise<PublicRoomCard[]> {
  const url = new URL(`${RPC_URL}/rooms`)
  url.searchParams.set('is_public', 'eq.true')
  url.searchParams.set('state', 'eq.lobby')
  url.searchParams.set('order', 'created_at.desc')
  url.searchParams.set('limit', String(opts?.limit ?? 20))
  // Codex P1 v2: room_members(count) embed yerine rooms.member_count
  // (anon icin RLS gerek olmaz, denormalized cached).
  url.searchParams.set(
    'select',
    'id,code,title,category,difficulty,question_count,max_players,member_count,created_at',
  )
  if (opts?.category) {
    url.searchParams.set('category', `eq.${opts.category}`)
  }

  const headers: Record<string, string> = {}
  if (jwt) headers.Authorization = `Bearer ${jwt}`

  try {
    const res = await fetch(url.toString(), {
      headers,
      cache: 'no-store',
    })
    if (!res.ok) {
      // Codex P3 #3 fix: silent failure observability — production'da Sentry
      // gormeli (network/RLS hatasi vs. RLS empty ayriliyor).
      console.error(
        '[fetchPublicRooms] non-OK response',
        res.status,
        res.statusText,
      )
      return []
    }
    return (await res.json()) as PublicRoomCard[]
  } catch (err) {
    // Codex P3 #3 fix: network reject observability
    console.error('[fetchPublicRooms] fetch failed', err)
    return []
  }
}

// =============================================================================
// LobbyPreviewQuestion (Sprint 2A Task 2)
// =============================================================================
/**
 * Anti-cheat sift: sadece question + options. correct_answer asla client'a
 * gonderilmez (RPC SECURITY INVOKER + JSONB build sift).
 */
export type LobbyPreviewQuestion = {
  question: string
  options: string[]
}

/**
 * Lobby beklerken kategori-uygun rastgele 1 soru ceker. RPC anti-cheat sift
 * (correct_answer haric). Eslesme yoksa null.
 *
 * Anti-cheat tradeoff (plan-deviation #62): gercek questions havuzundan, MVP
 * kabul. Risk: preview sorusu sonradan oyunda cikabilir (~%1-5).
 */
export async function fetchLobbyPreviewQuestion(
  jwt: string,
  category: string,
): Promise<LobbyPreviewQuestion | null> {
  try {
    const res = await fetch(`${RPC_URL}/rpc/get_lobby_preview_question`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_category: category }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as LobbyPreviewQuestion | null
    if (!data || typeof data.question !== 'string' || !Array.isArray(data.options)) {
      return null
    }
    return { question: data.question, options: data.options }
  } catch {
    return null
  }
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
  /** PR4f: cevap veren kullanici filter (my_answer query); RLS auth.uid() de
   *  kontrol eder ama explicit filter pickup hatalarinin onune gecer. */
  userId?: string,
): Promise<Omit<RoomFullState, 'online' | 'isStale' | 'typing_users'> | null> {
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

    // PR4f: my_answer (current round, user'in kendi cevabi) query.
    // RLS active state'inde sadece kendi cevap satirini gormeli, reveal sonrasi
    // tum cevaplar gorunur. Filter explicit user_id=eq.{userId} guvenli.
    let my_answer:
      | {
          answer_value: string
          is_correct: boolean | null
          points_awarded: number
          response_ms: number
        }
      | null = null
    if (current_round?.round_id && userId) {
      const myAnswerRes = await fetch(
        `${RPC_URL}/room_answers?round_id=eq.${current_round.round_id}&user_id=eq.${userId}&select=answer_value,is_correct,points_awarded,response_ms&limit=1`,
        opts,
      )
      if (myAnswerRes.ok) {
        const rows = (await myAnswerRes.json()) as Array<typeof my_answer>
        my_answer = rows[0] ?? null
      }
    }

    // PR4g: scoreboard hesaplama (reveal/completed/archived state).
    // Lobby/active'de gerekmez. RLS reveal sonrasi tum room_answers SELECT
    // eder, oncesinde sadece kendi cevabi (popularity yok).
    // Tie-breaker: score DESC, correct_count DESC, response_ms_total ASC (hizli).
    let scoreboard: Array<{
      user_id: string
      display_name: string
      score: number
      correct_count: number
      response_ms_total: number
    }> = []
    const isPostGame = ['reveal', 'completed', 'archived'].includes(rooms[0].state)
    if (isPostGame && members.length > 0) {
      const allAnswersRes = await fetch(
        `${RPC_URL}/room_answers?room_id=eq.${roomId}&select=user_id,is_correct,response_ms`,
        opts,
      )
      if (allAnswersRes.ok) {
        const allAnswers = (await allAnswersRes.json()) as Array<{
          user_id: string
          is_correct: boolean | null
          response_ms: number
        }>
        const agg = new Map<string, { correct: number; ms_total: number }>()
        for (const a of allAnswers) {
          const cur = agg.get(a.user_id) ?? { correct: 0, ms_total: 0 }
          if (a.is_correct === true) cur.correct += 1
          cur.ms_total += a.response_ms ?? 0
          agg.set(a.user_id, cur)
        }
        scoreboard = members
          .filter((m) => !m.is_kicked)
          .map((m) => {
            const a = agg.get(m.user_id) ?? { correct: 0, ms_total: 0 }
            return {
              user_id: m.user_id,
              // Codex P1 #80: display_name NULL/undefined fallback "Oyuncu"
              display_name: m.display_name ?? 'Oyuncu',
              score: m.score ?? 0,
              correct_count: a.correct,
              response_ms_total: a.ms_total,
            }
          })
          .sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score
            if (a.correct_count !== b.correct_count)
              return b.correct_count - a.correct_count
            return a.response_ms_total - b.response_ms_total
          })
      }
    }

    return {
      room: rooms[0],
      members,
      current_round,
      answers_count,
      my_answer,
      scoreboard,
    }
  } catch {
    return null
  }
}

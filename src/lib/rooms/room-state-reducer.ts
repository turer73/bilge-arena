/**
 * Bilge Arena Oda Sistemi: Room State Reducer (Pure State Machine)
 * Sprint 1 PR4b Task 2
 *
 * Realtime channel event'leri (postgres_changes + presence) -> state guncellemesi.
 * Pure func, side-effect yok. setupRoomChannel (side-effect layer) bu reducer'i
 * dispatch eder, useRoomChannel hook'u useReducer ile orchestrate eder.
 *
 * Event tipleri:
 *   HYDRATE          - REST resync (mount + reconnect)
 *   ROOM_UPDATE      - rooms tablosu UPDATE
 *   MEMBER_INSERT    - room_members INSERT (idempotent)
 *   MEMBER_UPDATE    - room_members UPDATE (kick, score)
 *   MEMBER_DELETE    - room_members DELETE (leave)
 *   PRESENCE_SYNC    - presence sync (full snapshot)
 *   PRESENCE_JOIN    - presence join (1 user)
 *   PRESENCE_LEAVE   - presence leave (1 user)
 *   CHANNEL_ERROR    - WebSocket / system error
 *
 * Online state ephemeral: presence-derived Set, postgres_changes ile relate yok.
 * isStale: channel error sonrasi UI banner gostermek icin flag.
 */

export type Member = {
  user_id: string
  /** Sprint 2B Task 4 Codex P1 #80: bot icin 'Bot 1/2/3', real user icin
   *  NULL/undefined (Sprint 1 davranisi — UI/profiles fallback "Oyuncu"). */
  display_name?: string | null
  emoji?: string
  joined_at: string
  is_host: boolean
  is_kicked: boolean
  score?: number
  /** Sprint 2B Task 4: bot rakipler (solo mode) */
  is_bot?: boolean
}

/**
 * DB CHECK constraint chk_rooms_state ile birebir.
 * 2_rooms.sql:133 — ('lobby','active','reveal','completed','archived').
 *
 * Plan-deviation: design.md Bolum 3'te yanlislikla 'in_progress'/'finished'/
 * 'cancelled' yazilmis (Anatolia360 model). DB'de yok, types.ts dogru.
 */
export type Room = {
  id: string
  code: string
  title: string
  state: 'lobby' | 'active' | 'reveal' | 'completed' | 'archived'
  mode: 'sync' | 'async'
  host_id: string
  category: string
  difficulty: number
  question_count: number
  max_players: number
  per_question_seconds: number
  /** Sprint 2A Task 1: 0=manuel, 1-30=auto-advance saniye (default 5) */
  auto_advance_seconds?: number
  /** PR4e: 0=lobby/bootstrap-pending, 1..N=aktif round_index */
  current_round_index?: number
  /** Sprint 2A Task 3: public oda discovery (host opt-in) */
  is_public?: boolean
  created_at: string
  started_at?: string | null
  ended_at?: string | null
  archived_at?: string | null
}

/**
 * room_round_question_view ile birebir (anti-cheat: revealed_at NULL ise
 * correct_answer + explanation NULL doner). PR4e-2'de question_text +
 * options + correct_answer eklendi.
 *
 * NOT: PR4b'de yanlislikla 'round_number'/'deadline' yazilmisti, DB ve
 * view 'round_index'/'ends_at' kullaniyor (types.ts:147 + 6_rooms.sql).
 * PR4e2-3 hot-fix.
 */
export type CurrentRound = {
  round_id?: string
  round_index: number
  question_id: string
  started_at: string
  /** Server-computed via started_at + per_question_seconds, view alani */
  ends_at: string
  revealed_at: string | null
  /** room_round_question_view'den gelen soru icerigi (PR4e-2) */
  question_text?: string
  options?: string[]
  /** revealed_at IS NOT NULL ise dolu, aksi NULL */
  correct_answer?: string | null
  explanation?: string | null
}

export type ScoreboardEntry = {
  user_id: string
  display_name: string
  score: number
  correct_count: number
  /** PR4g tie-breaker: total response_ms (lower = faster = better) */
  response_ms_total: number
}

/** Mevcut kullanicinin aktif round'a verdigi cevap (PR4f).
 *  RLS: active state'inde sadece kendi cevabi gorunur; reveal sonrasi
 *  is_correct + points_awarded server compute edilmis halde gelir. */
export type MyAnswer = {
  answer_value: string
  is_correct: boolean | null
  points_awarded: number
  response_ms: number
}

export type RoomState = {
  room: Room
  members: Member[]
  current_round: CurrentRound | null
  answers_count: number
  /** PR4f: kullanicinin kendi cevabi (active state'inde anonim, reveal sonrasi
   *  is_correct + points dolu) */
  my_answer: MyAnswer | null
  scoreboard: ScoreboardEntry[]
  /** presence-derived ephemeral online users */
  online: Set<string>
  /** PR4h: aktif soruda dusunmekte olan oyuncular (broadcast typing event,
   *  3sn sonra otomatik temizlenir). Anti-cheat: hangi cevabi sectigi gorulmez,
   *  sadece "biri secim yapiyor" sinyali. */
  typing_users: Set<string>
  /** Channel error sonrasi UI banner flag, hydrate ile false yapilir */
  isStale: boolean
}

export type RoomEvent =
  | {
      type: 'HYDRATE'
      payload: Omit<RoomState, 'online' | 'isStale' | 'typing_users'>
    }
  | { type: 'ROOM_UPDATE'; payload: Partial<Room> }
  | { type: 'MEMBER_INSERT'; payload: Member }
  | { type: 'MEMBER_UPDATE'; payload: Member }
  | { type: 'MEMBER_DELETE'; payload: { user_id: string } }
  | { type: 'PRESENCE_SYNC'; payload: { online: string[] } }
  | { type: 'PRESENCE_JOIN'; payload: { user_id: string } }
  | { type: 'PRESENCE_LEAVE'; payload: { user_id: string } }
  | { type: 'TYPING_START'; payload: { user_id: string } }
  | { type: 'TYPING_STOP'; payload: { user_id: string } }
  | { type: 'CHANNEL_ERROR'; payload: { error: string } }

export function roomStateReducer(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case 'HYDRATE':
      return {
        ...event.payload,
        online: state.online,
        typing_users: state.typing_users,
        isStale: false,
      }

    case 'ROOM_UPDATE':
      return { ...state, room: { ...state.room, ...event.payload } }

    case 'MEMBER_INSERT': {
      const existing = state.members.find(
        (m) => m.user_id === event.payload.user_id,
      )
      if (existing) return state
      return { ...state, members: [...state.members, event.payload] }
    }

    case 'MEMBER_UPDATE':
      return {
        ...state,
        members: state.members.map((m) =>
          m.user_id === event.payload.user_id ? event.payload : m,
        ),
      }

    case 'MEMBER_DELETE':
      return {
        ...state,
        members: state.members.filter(
          (m) => m.user_id !== event.payload.user_id,
        ),
      }

    case 'PRESENCE_SYNC':
      return { ...state, online: new Set(event.payload.online) }

    case 'PRESENCE_JOIN': {
      const next = new Set(state.online)
      next.add(event.payload.user_id)
      return { ...state, online: next }
    }

    case 'PRESENCE_LEAVE': {
      const next = new Set(state.online)
      next.delete(event.payload.user_id)
      return { ...state, online: next }
    }

    case 'TYPING_START': {
      if (state.typing_users.has(event.payload.user_id)) return state
      const next = new Set(state.typing_users)
      next.add(event.payload.user_id)
      return { ...state, typing_users: next }
    }

    case 'TYPING_STOP': {
      if (!state.typing_users.has(event.payload.user_id)) return state
      const next = new Set(state.typing_users)
      next.delete(event.payload.user_id)
      return { ...state, typing_users: next }
    }

    case 'CHANNEL_ERROR':
      return { ...state, isStale: true }

    default:
      return state
  }
}

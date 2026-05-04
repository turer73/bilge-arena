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
  /** Async PR1 Faz A1: per-user round pointer (sync modda 0, async modda 1+) */
  current_round_index?: number
  /** Async PR1 Faz A1: per-round start time (response_ms hesabi icin server-side) */
  current_round_started_at?: string | null
  /** Async PR1 Faz A1: NOT NULL = uye tum sorulari bitirdi, scoreboard'da gozukur */
  finished_at?: string | null
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
      /** Async PR1 Faz B1: optimistic-fresher koruma. Async modda caller'in
       *  member.current_round_index lokal state'tekinden ESKI ise lokal tutulur
       *  (polling 3-5sn HYDRATE delay'i optimistic submit/advance'i geri yutmasin).
       *  Sync modda undefined/normal HYDRATE replace. */
      caller_user_id?: string
    }
  | { type: 'ROOM_UPDATE'; payload: Partial<Room> }
  | { type: 'MEMBER_INSERT'; payload: Member }
  | { type: 'MEMBER_UPDATE'; payload: Member }
  | { type: 'MEMBER_DELETE'; payload: { user_id: string } }
  /** Async PR1 Faz B1: client-side member alanlari optimistic update.
   *  submit_answer_async/advance_round_for_member RPC return'unden member.score,
   *  current_round_index, current_round_started_at, finished_at degisiklikleri
   *  HYDRATE polling'i beklemeden state'e yansitilir. */
  | {
      type: 'MEMBER_OPTIMISTIC_UPDATE'
      payload: { user_id: string; updates: Partial<Member> }
    }
  /** Async PR2 Faz C: submit_answer_async RPC return ile my_answer'i lokal
   *  optimistic set. Polling HYDRATE 3-5sn delay yerine UI anlik SonucView'a
   *  flip eder. payload=null: clear (advance sonrasi). */
  | { type: 'OPTIMISTIC_MY_ANSWER_SET'; payload: MyAnswer | null }
  /** Async PR2 Faz C Codex P1: submit_answer_async RPC return correct_answer +
   *  explanation'i current_round'a patchle. Async modda room_round_question_view
   *  revealed_at NULL oldugu icin correct_answer NULL doner — bu patch UI'da
   *  SonucView'in dogru cevabi gostermesini saglar (yoksa kullanici dogru
   *  cevap verse bile "yanlis" rengi gorur). */
  | { type: 'OPTIMISTIC_CURRENT_ROUND_PATCH'; payload: Partial<CurrentRound> }
  | { type: 'PRESENCE_SYNC'; payload: { online: string[] } }
  | { type: 'PRESENCE_JOIN'; payload: { user_id: string } }
  | { type: 'PRESENCE_LEAVE'; payload: { user_id: string } }
  | { type: 'TYPING_START'; payload: { user_id: string } }
  | { type: 'TYPING_STOP'; payload: { user_id: string } }
  | { type: 'CHANNEL_ERROR'; payload: { error: string } }

export function roomStateReducer(state: RoomState, event: RoomEvent): RoomState {
  switch (event.type) {
    case 'HYDRATE': {
      // Async PR1 Faz B1: optimistic-fresher koruma. Async modda caller'in
      // member.current_round_index server'dan gelene gore lokalde DAHA ILERIDE
      // ise lokal version korunur (polling delay'i optimistic submit/advance'i
      // geri yutmasin). finished_at lokal NOT NULL ise server NULL ise yine
      // lokal kazanir (geri donusum yok).
      const isAsync = event.payload.room.mode === 'async'
      const callerId = event.caller_user_id

      if (!isAsync || !callerId) {
        // Sync mod veya caller_user_id yok: direkt full replace (mevcut paterni)
        return {
          ...event.payload,
          online: state.online,
          typing_users: state.typing_users,
          isStale: false,
        }
      }

      // Async + caller belli: caller'in lokal member'i fresher mi check
      const localMe = state.members.find((m) => m.user_id === callerId)
      const serverMe = event.payload.members.find((m) => m.user_id === callerId)

      let mergedMembers = event.payload.members
      if (localMe && serverMe) {
        const localIdx = localMe.current_round_index ?? 0
        const serverIdx = serverMe.current_round_index ?? 0
        const localFinished = localMe.finished_at != null
        const serverFinished = serverMe.finished_at != null

        // Lokal optimistic ileride: lokal kazanir
        const localFresher =
          localIdx > serverIdx || (localFinished && !serverFinished)

        if (localFresher) {
          mergedMembers = event.payload.members.map((m) =>
            m.user_id === callerId
              ? {
                  ...m,
                  current_round_index: localMe.current_round_index,
                  current_round_started_at: localMe.current_round_started_at,
                  finished_at: localMe.finished_at,
                  score: Math.max(m.score ?? 0, localMe.score ?? 0),
                }
              : m,
          )
        }
      }

      // Codex PR #100 P1 fix: my_answer + current_round.correct_answer/
      // explanation/revealed_at lokal optimistic patch'i polling HYDRATE
      // overwrite etmesin. Async modda submit_answer_async return'unden
      // gelen veriler revealed_at NULL gelir (server view), polling stale
      // overwrite ederse SonucView dogru cevap renklendirmesi kaybolur.
      let mergedMyAnswer = event.payload.my_answer
      if (state.my_answer && !event.payload.my_answer) {
        // Lokal optimistic kazanir (server henuz gormemis veya RLS gizli)
        mergedMyAnswer = state.my_answer
      }

      let mergedCurrentRound = event.payload.current_round
      if (
        state.current_round &&
        event.payload.current_round &&
        state.current_round.round_id === event.payload.current_round.round_id
      ) {
        // Ayni round_id — lokal patch'i (correct_answer/explanation/revealed_at)
        // server NULL ise koru. Member sonraki round'a gectiginde polling
        // farkli round_id getirir, bu kosul tetiklenmez (eski round patch
        // overwrite olur, bu istenen davranis).
        mergedCurrentRound = {
          ...event.payload.current_round,
          correct_answer:
            state.current_round.correct_answer ??
            event.payload.current_round.correct_answer,
          explanation:
            state.current_round.explanation ??
            event.payload.current_round.explanation,
          revealed_at:
            state.current_round.revealed_at ??
            event.payload.current_round.revealed_at,
        }
      }

      return {
        ...event.payload,
        members: mergedMembers,
        my_answer: mergedMyAnswer,
        current_round: mergedCurrentRound,
        online: state.online,
        typing_users: state.typing_users,
        isStale: false,
      }
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

    case 'MEMBER_OPTIMISTIC_UPDATE':
      return {
        ...state,
        members: state.members.map((m) =>
          m.user_id === event.payload.user_id
            ? { ...m, ...event.payload.updates }
            : m,
        ),
      }

    case 'OPTIMISTIC_MY_ANSWER_SET':
      return { ...state, my_answer: event.payload }

    case 'OPTIMISTIC_CURRENT_ROUND_PATCH':
      return state.current_round
        ? {
            ...state,
            current_round: { ...state.current_round, ...event.payload },
          }
        : state

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

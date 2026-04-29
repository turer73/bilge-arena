/**
 * Bilge Arena Oda Sistemi: TypeScript types
 * Sprint 1 PR3 (API foundation)
 *
 * DB schema referansi: infra/vps/bilge-arena/sql/2_rooms.sql + 8_rooms_functions_create.sql
 *
 * Plan-deviations (PR1-PR3 kalitim, kod ile uyumlu):
 *   #38: state machine = lobby/active/reveal/completed/archived
 *   #39: cancel_room state='completed' + audit_log marker
 *   #41: caller identity = auth.uid() (parametre yerine)
 *   #43: linear decay score formula
 */

// =============================================================================
// Game enum (questions.game CHECK ile uyumlu)
// =============================================================================
export const GAMES = ['matematik', 'turkce', 'fen', 'sosyal'] as const
// NOT: 'wordquest' Panola'da var ama plan-deviation #51 sebebiyle bilge_arena_dev'e
// sync edilmiyor (kelime arena ayri sprint'te normalize edilir).
export type Game = (typeof GAMES)[number]

// =============================================================================
// Room state machine
// =============================================================================
export const ROOM_STATES = [
  'lobby', // host + members beklerken
  'active', // current round live (submit_answer aktif)
  'reveal', // current round revealed (puanlar dolu, hold suresi bekleniyor)
  'completed', // oyun bitti (natural finish veya cancel)
  'archived', // 30+ gun completed sonra retention cron archive yapti
] as const
export type RoomState = (typeof ROOM_STATES)[number]

export const ROOM_MODES = ['sync', 'async'] as const
export type RoomMode = (typeof ROOM_MODES)[number]

// =============================================================================
// Room (rooms tablosu, 2_rooms.sql)
// =============================================================================
export interface Room {
  id: string // UUID
  code: string // CHAR(6) Crockford-32: ^[A-HJ-NP-Z2-9]{6}$
  title: string // 3-80 char
  host_id: string // UUID (Panola GoTrue user)
  category: string
  difficulty: number // 1-5
  question_count: number // 5-30
  max_players: number // 2-20
  per_question_seconds: number // 10-60
  mode: RoomMode
  state: RoomState
  current_round_index: number // 0=henuz baslamadi, 1..N = aktif round
  created_at: string // ISO 8601
  updated_at: string
  started_at: string | null
  ended_at: string | null
  archived_at: string | null
}

// =============================================================================
// Room member (room_members tablosu)
// =============================================================================
export const ROOM_MEMBER_ROLES = ['host', 'player', 'spectator'] as const
export type RoomMemberRole = (typeof ROOM_MEMBER_ROLES)[number]

export interface RoomMember {
  id: string
  room_id: string
  user_id: string
  role: RoomMemberRole
  joined_at: string
  left_at: string | null
  score: number
  streak: number
  is_active: boolean
}

// =============================================================================
// Room round (room_rounds tablosu, soru turlari)
// =============================================================================
export interface RoomRound {
  id: string
  room_id: string
  round_index: number
  question_id: string // UUID, FK YOK (plan-deviation #27, replay snapshot kullanilir)
  question_content_snapshot: QuestionContent // JSONB frozen kopya
  started_at: string
  ends_at: string
  revealed_at: string | null // NULL until reveal
  closed_at: string | null
}

// Question content JSONB sema (chk_content_required_fields):
//   {question, options, answer} — wordquest farkli (filter sync'ten geliyor #51)
export interface QuestionContent {
  question: string
  options: string[]
  answer: string | number // index OR direct value (game'e gore)
  solution?: string
  explanation?: string
}

// =============================================================================
// Room answer (room_answers tablosu, anti-cheat critical)
// =============================================================================
export interface RoomAnswer {
  id: string
  room_id: string
  round_id: string
  user_id: string
  answer_value: string
  is_correct: boolean | null // NULL until reveal_round (anti-cheat)
  response_ms: number // server-calculated, NOT client-supplied
  points_awarded: number // 0 until reveal_round (linear decay)
  submitted_at: string
}

// =============================================================================
// Room reaction (room_reactions tablosu, emote sistem)
// =============================================================================
export const REACTIONS = [
  'baykus',
  'kalp',
  'alkis',
  'yildiz',
  'gulme',
  'sok',
  'hosgeldin',
  'tebrikler',
] as const
export type Reaction = (typeof REACTIONS)[number]

export interface RoomReaction {
  id: string
  room_id: string
  user_id: string
  reaction: Reaction
  created_at: string
}

// =============================================================================
// Anti-cheat view (room_round_question_view, PR1)
// =============================================================================
// SELECT cikti: revealed_at NULL ise correct_answer NULL doner.
// Client reveal'dan once correct_answer'a erisemez.
export interface RoomRoundQuestionView {
  round_id: string
  room_id: string
  round_index: number
  question_id: string
  started_at: string
  ends_at: string
  revealed_at: string | null
  question_text: string
  options: string[]
  correct_answer: string | null // revealed_at IS NOT NULL ise dolu
  explanation: string | null
}

// =============================================================================
// RPC payloads (create_room input/output)
// =============================================================================
export interface CreateRoomInput {
  p_title: string
  p_category: string
  p_difficulty?: number // default 2
  p_question_count?: number // default 10
  p_max_players?: number // default 8
  p_per_question_seconds?: number // default 20
  p_mode?: RoomMode // default 'sync'
}

export interface CreateRoomResponse {
  id: string // UUID
  code: string // CHAR(6) Crockford-32
}

// =============================================================================
// RPC payloads (state-transition functions)
// =============================================================================
export interface JoinRoomInput {
  p_code: string // CHAR(6)
}

export interface SubmitAnswerInput {
  p_room_id: string
  p_answer_value: string
}

export interface SimpleRoomIdInput {
  p_room_id: string
}

export interface CancelRoomInput {
  p_room_id: string
  p_reason: string
}

export interface KickMemberInput {
  p_room_id: string
  p_target_user_id: string
}

/**
 * Bilge Arena Oda Sistemi: Zod validation schemas
 * Sprint 1 PR3
 *
 * DB CHECK constraint'lerle birebir uyumlu (2_rooms.sql):
 *   - title: 3-80 char (chk_rooms_title_length)
 *   - difficulty: 1-5 (chk_rooms_difficulty)
 *   - question_count: 5-30 (chk_rooms_question_count)
 *   - max_players: 2-20 (chk_rooms_max_players)
 *   - per_question_seconds: 10-60 (chk_rooms_per_question_seconds)
 *   - mode: 'sync' | 'async' (chk_rooms_mode)
 *   - code: ^[A-HJ-NP-Z2-9]{6}$ (chk_rooms_code_format)
 *
 * NOT: SQL function default'lari TS'te de varsayilan olarak duruyor.
 * API katmani once Zod, sonra DB CHECK, ikinci savunma hatti.
 */

import { z } from 'zod'

// =============================================================================
// Crockford-32 code regex (chk_rooms_code_format ile birebir)
// =============================================================================
export const ROOM_CODE_REGEX = /^[A-HJ-NP-Z2-9]{6}$/

// =============================================================================
// POST /api/rooms (create_room input)
// =============================================================================
export const createRoomSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, 'Baslik en az 3 karakter olmali')
    .max(80, 'Baslik en fazla 80 karakter olabilir'),
  category: z
    .string()
    .trim()
    .min(1, 'Kategori secilmeli')
    .max(30, 'Kategori en fazla 30 karakter'),
  difficulty: z
    .number()
    .int()
    .min(1)
    .max(5)
    .default(2),
  question_count: z
    .number()
    .int()
    .min(5)
    .max(30)
    .default(10),
  max_players: z
    .number()
    .int()
    .min(2)
    .max(20)
    .default(8),
  per_question_seconds: z
    .number()
    .int()
    .min(10)
    .max(60)
    .default(20),
  mode: z.enum(['sync', 'async']).default('sync'),
})

export type CreateRoomBody = z.infer<typeof createRoomSchema>

// =============================================================================
// POST /api/rooms/join (join_room input)
// =============================================================================
export const joinRoomSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(ROOM_CODE_REGEX, 'Gecersiz oda kodu format'),
})

export type JoinRoomBody = z.infer<typeof joinRoomSchema>

// =============================================================================
// POST /api/rooms/:id/answer (submit_answer input)
// =============================================================================
export const submitAnswerSchema = z.object({
  answer_value: z
    .string()
    .trim()
    .min(1, 'Cevap bos olamaz')
    .max(200, 'Cevap cok uzun'),
})

export type SubmitAnswerBody = z.infer<typeof submitAnswerSchema>

// =============================================================================
// POST /api/rooms/:id/cancel (cancel_room input)
// =============================================================================
export const cancelRoomSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .default('host_canceled'),
})

export type CancelRoomBody = z.infer<typeof cancelRoomSchema>

// =============================================================================
// POST /api/rooms/:id/kick (kick_member input)
// =============================================================================
export const kickMemberSchema = z.object({
  target_user_id: z.string().uuid('Gecersiz user_id format'),
})

export type KickMemberBody = z.infer<typeof kickMemberSchema>

// =============================================================================
// startRoomAction (Server Action) — PR4c
// =============================================================================
export const startRoomSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
})

export type StartRoomBody = z.infer<typeof startRoomSchema>

// =============================================================================
// cancelRoomAction (Server Action) — PR4c
// =============================================================================
export const cancelRoomActionSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
  reason: z.string().trim().min(1).max(100).default('host_canceled'),
})

export type CancelRoomActionBody = z.infer<typeof cancelRoomActionSchema>

// =============================================================================
// kickMemberAction (Server Action) — PR4d
// =============================================================================
export const kickMemberActionSchema = z.object({
  room_id: z.string().uuid('Gecersiz oda kimligi'),
  target_user_id: z.string().uuid('Gecersiz hedef kullanici kimligi'),
})

export type KickMemberActionBody = z.infer<typeof kickMemberActionSchema>
